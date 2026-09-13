import { Injectable, Logger } from '@nestjs/common';
import { Credentials, OAuth2Client } from 'google-auth-library';

import { GoogleOAuthAdapter } from '../adapters';
import config from '../config';
import { GOOGLE_BUSINESS_SCOPE } from '../endpoints';
import { GoogleTokens } from '../dtos';
import { GoogleApiError } from '../errors';

interface OAuthErrorBody {
  error?: string;
  error_description?: string;
}

const DEFAULT_EXPIRY_MS = 3600 * 1000;

/**
 * OAuth 2.0 con Google usando la libreria oficial (`google-auth-library`): no se arman
 * a mano las URLs de authorization/token ni se inventan endpoints.
 *
 * Ningun token entra en logs ni en mensajes de error.
 */
@Injectable()
export class GoogleOAuthService implements GoogleOAuthAdapter {
  private readonly logger = new Logger(GoogleOAuthService.name);

  isConfigured(): boolean {
    return Boolean(config.OAuth.ClientId && config.OAuth.ClientSecret && config.OAuth.RedirectUri);
  }

  buildAuthorizationUrl(state: string): string {
    return this.client().generateAuthUrl({
      // offline + consent garantizan refresh_token: sin el, habria que reconectar a diario.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [GOOGLE_BUSINESS_SCOPE],
      state,
    });
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    try {
      const { tokens } = await this.client().getToken(code);
      return this.toTokens(tokens);
    } catch (error) {
      throw this.normalize(error, 'oauth.exchangeCode');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    const client = this.client();
    client.setCredentials({ refresh_token: refreshToken });

    try {
      const { credentials } = await client.refreshAccessToken();
      return this.toTokens({ refresh_token: refreshToken, ...credentials });
    } catch (error) {
      throw this.normalize(error, 'oauth.refreshAccessToken');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      await this.client().revokeToken(token);
    } catch (error) {
      // Revocar es best-effort: si Google ya lo invalido, igual borramos la conexion local.
      this.logger.warn(`Could not revoke Google token: ${this.normalize(error, 'oauth.revokeToken').reason}`);
    }
  }

  private client(): OAuth2Client {
    return new OAuth2Client(config.OAuth.ClientId, config.OAuth.ClientSecret, config.OAuth.RedirectUri);
  }

  private toTokens(credentials: Credentials): GoogleTokens {
    if (!credentials.access_token) {
      throw new GoogleApiError(undefined, 'missing_access_token', 'oauth.token');
    }

    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? undefined,
      expiresAt: new Date(credentials.expiry_date ?? Date.now() + DEFAULT_EXPIRY_MS),
      scopes: credentials.scope?.split(' ').filter(Boolean) ?? [GOOGLE_BUSINESS_SCOPE],
    };
  }

  /**
   * `invalid_grant` significa que el usuario revoco el acceso o que el refresh token murio:
   * se propaga como razon para que el dominio marque la conexion como revocada.
   */
  private normalize(error: unknown, operation: string): GoogleApiError {
    if (error instanceof GoogleApiError) {
      return error;
    }

    const candidate = error as { response?: { status?: number; data?: OAuthErrorBody }; message?: string };
    const body = candidate?.response?.data;

    return new GoogleApiError(candidate?.response?.status, body?.error ?? candidate?.message ?? 'unknown', operation);
  }
}
