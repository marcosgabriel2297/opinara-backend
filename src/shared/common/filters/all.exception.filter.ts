import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { isDevelopment } from '@shared/environment';
import { ErrorMessages, Errors } from '../errors';
import { ErrorResponse } from './error.response';

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
  details?: unknown;
}

/**
 * Codigo estable para las excepciones que genera el propio framework (ruta inexistente,
 * validacion de DTO, rate limit), que no traen un codigo del enum `Errors`.
 */
const STATUS_ERROR_CODES: Partial<Record<number, Errors>> = {
  [HttpStatus.BAD_REQUEST]: Errors.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: Errors.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: Errors.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: Errors.NOT_FOUND,
  [HttpStatus.CONFLICT]: Errors.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: Errors.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: Errors.SERVICE_UNAVAILABLE,
};

const KNOWN_ERROR_CODES = new Set<string>(Object.values(Errors));

/**
 * Filtro global de errores.
 * En produccion nunca expone stack traces ni el cuerpo crudo de un error de un tercero:
 * lo que no es `HttpException` se degrada a 500 con mensaje generico y queda en el log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const path = httpAdapter?.getRequestUrl(ctx.getRequest()) ?? '';

    const responseBody = this.buildBody(exception, path);

    if (responseBody.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${responseBody.errorCode} ${path}`, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${responseBody.errorCode} ${path}: ${responseBody.message}`);
    }

    httpAdapter?.reply(ctx.getResponse(), responseBody, responseBody.statusCode);
  }

  private buildBody(exception: unknown, path: string): ErrorResponse {
    const base = { timestamp: new Date().toISOString(), path };

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const parsed: HttpExceptionBody = typeof body === 'object' && body !== null ? (body as HttpExceptionBody) : {};
      const message = Array.isArray(parsed.message) ? parsed.message.join(', ') : (parsed.message ?? exception.message);
      const statusCode = exception.getStatus();

      return {
        ...base,
        statusCode,
        message,
        errorCode: this.resolveErrorCode(parsed.error, statusCode),
        details: parsed.details,
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: this.internalMessage(exception),
      errorCode: Errors.INTERNAL_SERVER_ERROR,
    };
  }

  /** Solo se propaga el codigo de la excepcion si pertenece al enum `Errors`. */
  private resolveErrorCode(candidate: string | undefined, statusCode: number): string {
    if (candidate !== undefined && KNOWN_ERROR_CODES.has(candidate)) {
      return candidate;
    }

    return STATUS_ERROR_CODES[statusCode] ?? Errors.INTERNAL_SERVER_ERROR;
  }

  /**
   * El mensaje real de un error no controlado solo se muestra en desarrollo: puede traer
   * nombres de base/coleccion/indice o datos de un tercero.
   */
  private internalMessage(exception: unknown): string {
    if (!isDevelopment() || !(exception instanceof Error)) {
      return ErrorMessages[Errors.INTERNAL_SERVER_ERROR];
    }

    return exception.message;
  }
}
