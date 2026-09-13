import { Controller, Get, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { GoogleConfig } from '@shared/integrations/google/exports';

import config from '../config';
import * as DTO from '../dtos';
import * as Services from '../services';

const CALLBACK_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

/**
 * Callback de Google. Es publico por necesidad -lo invoca el browser del usuario tras el
 * consentimiento- y por eso el `state` de un solo uso es lo unico que lo autentica.
 */
@Controller('auth/google')
export class GoogleOAuthController {
  constructor(private readonly connections: Services.Connections) {}

  @Get('/callback')
  @Throttle(CALLBACK_THROTTLE)
  async callback(@Query() query: DTO.OAuthCallback, @Res({ passthrough: true }) response: Response) {
    // El usuario cancelo el consentimiento en la pantalla de Google.
    if (query.error) {
      return this.finish(response, false, Errors.GOOGLE_PERMISSION_DENIED);
    }

    if (!query.code || !query.state) {
      Exceptions.badRequest(Errors.GOOGLE_INVALID_OAUTH_STATE);
    }

    await this.connections.completeAuthorization(query.code, query.state);

    return this.finish(response, true);
  }

  /**
   * Si hay URLs de front configuradas se redirige; si no, se responde JSON para poder
   * completar el flujo con curl durante el desarrollo.
   */
  private finish(response: Response, success: boolean, errorCode?: Errors) {
    const target = success ? GoogleConfig.OAuth.SuccessUrl : GoogleConfig.OAuth.ErrorUrl;

    if (target) {
      const url = new URL(target);
      if (errorCode) {
        url.searchParams.set('error', errorCode);
      }
      response.redirect(url.toString());
      return undefined;
    }

    return success ? { status: 'connected' } : { status: 'error', errorCode };
  }
}
