import { createHash } from 'crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '@shared/common/crypto';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import {
  GOOGLE_OAUTH_ADAPTER,
  GoogleApiError,
  GoogleOAuthAdapter,
  throwAsDomainError,
} from '@shared/integrations/google/exports';
import { Business } from '@shared/models/business';
import { GoogleConnectionStatus } from '@shared/models/enums/google';

import config from '../config';
import {
  GOOGLE_CONNECTION_ENTITY,
  GoogleConnectionsRepository,
  OAUTH_STATE_ENTITY,
  OAuthStatesRepository,
  PublicGoogleConnection,
  toPublicConnection,
} from '../models';
import { AuthorizationRequest, CallbackResult } from '../interfaces';

const MILLIS = 1000;

@Injectable()
export class GoogleConnectionsService {
  private readonly logger = new Logger(GoogleConnectionsService.name);

  constructor(
    private readonly connectionsRepository: GoogleConnectionsRepository,
    private readonly statesRepository: OAuthStatesRepository,
    private readonly cryptoService: CryptoService,
    @Inject(GOOGLE_OAUTH_ADAPTER) private readonly oauth: GoogleOAuthAdapter,
  ) {}

  /**
   * Paso 1 del flujo: genera un `state` de un solo uso ligado al business y al usuario,
   * y devuelve la URL de consentimiento de Google.
   */
  async startAuthorization(business: Business, user: AuthenticatedUser): Promise<AuthorizationRequest> {
    if (!this.oauth.isConfigured()) {
      Exceptions.unavailable(Errors.GOOGLE_NOT_CONFIGURED);
    }

    const state = this.cryptoService.randomToken(config.State.Bytes);
    const expiresAt = new Date(Date.now() + config.State.TtlSeconds * MILLIS);

    await this.statesRepository.createOrUpdate({
      urn: Urn.createUUID(OAUTH_STATE_ENTITY),
      stateHash: this.hash(state),
      businessUrn: business.urn,
      userUrn: user.urn,
      expiresAt,
    });

    return { authorizationUrl: this.oauth.buildAuthorizationUrl(state), expiresAt };
  }

  /**
   * Paso 2: Google redirige el browser aca. El endpoint es publico, asi que el `state`
   * es lo unico que prueba que este callback corresponde a un flujo que iniciamos nosotros.
   */
  async completeAuthorization(code: string, state: string): Promise<CallbackResult> {
    const pending = await this.statesRepository.consume(this.hash(state));

    // Inexistente, ya usado o vencido: los tres casos son el mismo error.
    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      Exceptions.badRequest(Errors.GOOGLE_INVALID_OAUTH_STATE);
    }

    const tokens = await this.exchange(code);

    // Sin refresh token no podriamos volver a usar la cuenta sin pedirle al usuario que
    // reconecte: se rechaza la conexion en vez de guardar algo inservible.
    if (!tokens.refreshToken) {
      Exceptions.badRequest(Errors.GOOGLE_MISSING_REFRESH_TOKEN);
    }

    const existing = await this.connectionsRepository.findByBusiness(pending.businessUrn);

    await this.connectionsRepository.createOrUpdate({
      urn: existing?.urn ?? Urn.createUUID(GOOGLE_CONNECTION_ENTITY),
      businessUrn: pending.businessUrn,
      refreshToken: this.cryptoService.encrypt(tokens.refreshToken),
      accessToken: this.cryptoService.encrypt(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      status: GoogleConnectionStatus.ACTIVE,
      connectedByUserUrn: pending.userUrn,
      connectedAt: new Date(),
      revokedAt: undefined,
    });

    this.logger.log(`Google connection established for business ${pending.businessUrn}`);

    return { businessUrn: pending.businessUrn };
  }

  async getStatus(businessUrn: string): Promise<PublicGoogleConnection> {
    const connection = await this.connectionsRepository.findByBusiness(businessUrn);
    if (!connection) {
      Exceptions.notFound(Errors.GOOGLE_CONNECTION_NOT_FOUND);
    }

    return toPublicConnection(connection);
  }

  /**
   * Desconecta: revoca el permiso en Google y borra la conexion local.
   * Se borra el documento entero para no dejar tokens cifrados sin uso en la base.
   */
  async disconnect(businessUrn: string): Promise<void> {
    const connection = await this.connectionsRepository.findByBusiness(businessUrn);
    if (!connection) {
      Exceptions.notFound(Errors.GOOGLE_CONNECTION_NOT_FOUND);
    }

    await this.oauth.revokeToken(this.cryptoService.decrypt(connection.refreshToken));
    await this.connectionsRepository.deleteOne({ urn: connection.urn });
    await this.statesRepository.deleteForBusiness(businessUrn);

    this.logger.log(`Google connection removed for business ${businessUrn}`);
  }

  /**
   * El intercambio del code ocurre antes de que exista una conexion, asi que sus errores
   * no pueden mapearse como "conexion revocada": eso confundiria al negocio y a quien
   * depure el problema. La causa real (por ejemplo `invalid_client` por credenciales mal
   * configuradas) queda en el log del servidor, nunca en la respuesta.
   */
  private async exchange(code: string) {
    try {
      return await this.oauth.exchangeCode(code);
    } catch (error) {
      if (error instanceof GoogleApiError) {
        this.logger.error(`Google token exchange failed (${error.statusCode ?? 'no status'}): ${error.reason}`);

        // Un code invalido o ya usado se parece a un state invalido desde el punto de vista del usuario.
        if (error.reason === 'invalid_grant') {
          Exceptions.badRequest(Errors.GOOGLE_INVALID_OAUTH_STATE);
        }

        // 429 o 5xx siguen siendo problema de disponibilidad de Google.
        if (error.isRetryable) {
          return throwAsDomainError(error);
        }

        Exceptions.badRequest(Errors.GOOGLE_OAUTH_EXCHANGE_FAILED);
      }

      throw error;
    }
  }

  /** Se guarda el hash: un state filtrado de la base no sirve para nada. */
  private hash(state: string): string {
    return createHash('sha256').update(state, 'utf8').digest('base64');
  }
}
