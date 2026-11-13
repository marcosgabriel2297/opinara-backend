import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

import { Errors } from '@shared/common/errors';
import { AllExceptionsFilter } from '@shared/common/filters';
import { GoogleConfig } from '@shared/integrations/google/exports';

const GOOGLE_ERROR_CODES = new Set<string>(Object.values(Errors).filter((code) => code.startsWith('GOOGLE_')));

/**
 * El callback lo abre el navegador del dueño, no el frontend: un error respondido como JSON lo deja
 * en una pantalla técnica sobre el dominio de la API. Con `GOOGLE_OAUTH_ERROR_URL` configurada, todo
 * error (de dominio, de validación de la query o del rate limit) vuelve al frontend con `?error=CODIGO`.
 * Sin esa URL se mantiene el JSON del filtro global, que es lo que permite probar el flujo con curl.
 */
@Catch()
export class GoogleOAuthCallbackFilter extends AllExceptionsFilter {
  private readonly callbackLogger = new Logger(GoogleOAuthCallbackFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const target = GoogleConfig.OAuth.ErrorUrl;
    if (!target) {
      return super.catch(exception, host);
    }

    const errorCode = this.errorCodeFor(exception);
    const url = new URL(target);
    url.searchParams.set('error', errorCode);

    host.switchToHttp().getResponse<Response>().redirect(url.toString());
  }

  /** Solo viajan códigos `GOOGLE_*` del enum: nunca el mensaje ni el detalle de la excepción. */
  private errorCodeFor(exception: unknown): Errors {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;

      if (typeof code === 'string' && GOOGLE_ERROR_CODES.has(code)) {
        this.callbackLogger.warn(`OAuth callback failed: ${code}`);
        return code as Errors;
      }

      // Query que no pasa la validación: para el dueño es lo mismo que un state inválido, hay que empezar de nuevo.
      if (exception.getStatus() === HttpStatus.BAD_REQUEST) {
        this.callbackLogger.warn(`OAuth callback rejected by validation: ${exception.message}`);
        return Errors.GOOGLE_INVALID_OAUTH_STATE;
      }
    }

    this.callbackLogger.error(
      'Unexpected OAuth callback failure',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return Errors.GOOGLE_OAUTH_EXCHANGE_FAILED;
  }
}
