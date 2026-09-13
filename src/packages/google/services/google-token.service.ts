import { Inject, Injectable, Logger } from '@nestjs/common';

import { CryptoService, EncryptedValue } from '@shared/common/crypto';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import {
  GOOGLE_OAUTH_ADAPTER,
  GoogleApiError,
  GoogleConfig,
  GoogleOAuthAdapter,
  GoogleTokens,
  throwAsDomainError,
} from '@shared/integrations/google/exports';
import { GoogleConnectionStatus } from '@shared/models/enums/google';

import { GoogleConnection, GoogleConnectionsRepository } from '../models';

const MILLIS = 1000;

/**
 * Provee un access token valido para un business, renovandolo cuando hace falta.
 * Es el unico punto del sistema que descifra los tokens de Google.
 */
@Injectable()
export class GoogleTokenService {
  private readonly logger = new Logger(GoogleTokenService.name);

  constructor(
    private readonly connectionsRepository: GoogleConnectionsRepository,
    private readonly cryptoService: CryptoService,
    @Inject(GOOGLE_OAUTH_ADAPTER) private readonly oauth: GoogleOAuthAdapter,
  ) {}

  async getAccessToken(businessUrn: string): Promise<string> {
    const connection = await this.requireActiveConnection(businessUrn);

    if (this.isAccessTokenUsable(connection)) {
      return this.cryptoService.decrypt(connection.accessToken as EncryptedValue);
    }

    return this.refresh(connection);
  }

  async requireActiveConnection(businessUrn: string): Promise<GoogleConnection> {
    const connection = await this.connectionsRepository.findByBusiness(businessUrn);

    if (!connection) {
      Exceptions.notFound(Errors.GOOGLE_CONNECTION_NOT_FOUND);
    }

    if (connection.status !== GoogleConnectionStatus.ACTIVE) {
      Exceptions.badRequest(Errors.GOOGLE_CONNECTION_REVOKED);
    }

    return connection;
  }

  /** Se renueva antes del vencimiento real para no cortar una request en curso. */
  private isAccessTokenUsable(connection: GoogleConnection): boolean {
    if (!connection.accessToken || !connection.accessTokenExpiresAt) {
      return false;
    }

    const skewMs = GoogleConfig.Token.RefreshSkewSeconds * MILLIS;

    return connection.accessTokenExpiresAt.getTime() - skewMs > Date.now();
  }

  private async refresh(connection: GoogleConnection): Promise<string> {
    const refreshToken = this.cryptoService.decrypt(connection.refreshToken);

    let tokens: GoogleTokens;
    try {
      tokens = await this.oauth.refreshAccessToken(refreshToken);
    } catch (error) {
      if (error instanceof GoogleApiError) {
        // invalid_grant = el usuario revoco el acceso desde su cuenta de Google.
        if (error.isAuthFailure) {
          await this.markRevoked(connection);
          Exceptions.badRequest(Errors.GOOGLE_CONNECTION_REVOKED);
        }

        return throwAsDomainError(error);
      }

      throw error;
    }

    await this.connectionsRepository.createOrUpdate({
      urn: connection.urn,
      accessToken: this.cryptoService.encrypt(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      // Google puede rotar el refresh token: si manda uno nuevo, reemplaza al anterior.
      ...(tokens.refreshToken ? { refreshToken: this.cryptoService.encrypt(tokens.refreshToken) } : {}),
    });

    return tokens.accessToken;
  }

  private async markRevoked(connection: GoogleConnection): Promise<void> {
    this.logger.warn(`Google connection ${connection.urn} revoked by the user, marking it as REVOKED`);

    await this.connectionsRepository.createOrUpdate({
      urn: connection.urn,
      status: GoogleConnectionStatus.REVOKED,
      revokedAt: new Date(),
    });
  }
}
