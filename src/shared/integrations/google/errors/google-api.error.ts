import { HttpStatus } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';

/** Error normalizado de cualquier llamada a Google, sin el cuerpo crudo de la respuesta. */
export class GoogleApiError extends Error {
  constructor(
    readonly statusCode: number | undefined,
    readonly reason: string,
    readonly operation: string,
    /** Google informo que la cuota del proyecto es 0: el acceso a la API todavia no esta aprobado. */
    readonly quotaIsZero = false,
  ) {
    super(`Google API error on ${operation}: ${reason}`);
    this.name = 'GoogleApiError';
  }

  /**
   * Sin el Basic API Access aprobado, Google responde 429 RESOURCE_EXHAUSTED con limite 0. No es un
   * rate limit pasajero: no se arregla reintentando, sino cuando Google aprueba el proyecto.
   */
  get isAccessNotApproved(): boolean {
    return this.statusCode === HttpStatus.TOO_MANY_REQUESTS && this.quotaIsZero;
  }

  get isRetryable(): boolean {
    if (this.isAccessNotApproved) {
      return false;
    }

    return (
      this.statusCode === HttpStatus.TOO_MANY_REQUESTS ||
      (this.statusCode !== undefined && this.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR)
    );
  }

  /** La conexion dejo de ser valida: hay que reconectar la cuenta. */
  get isAuthFailure(): boolean {
    return this.statusCode === HttpStatus.UNAUTHORIZED || this.reason === 'invalid_grant';
  }
}

/**
 * Traduce un error de Google a una excepcion nuestra.
 * El cliente nunca ve el error crudo de Google, solo un codigo estable del enum `Errors`.
 */
export const throwAsDomainError = (error: GoogleApiError): never => {
  switch (error.statusCode) {
    case HttpStatus.UNAUTHORIZED:
      return Exceptions.badRequest(Errors.GOOGLE_CONNECTION_REVOKED);
    case HttpStatus.FORBIDDEN:
      return Exceptions.forbidden(Errors.GOOGLE_PERMISSION_DENIED);
    case HttpStatus.NOT_FOUND:
      return Exceptions.notFound(Errors.GOOGLE_RESOURCE_NOT_FOUND);
    case HttpStatus.TOO_MANY_REQUESTS:
      return Exceptions.unavailable(
        error.isAccessNotApproved ? Errors.GOOGLE_API_ACCESS_NOT_APPROVED : Errors.GOOGLE_RATE_LIMITED,
      );
    default:
      return Exceptions.unavailable(Errors.GOOGLE_UNAVAILABLE);
  }
};
