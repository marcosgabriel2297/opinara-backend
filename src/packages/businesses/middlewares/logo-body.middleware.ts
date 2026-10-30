import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response, raw } from 'express';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';

import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from '../logo-image';

const parseImage = raw({ type: [...LOGO_CONTENT_TYPES], limit: LOGO_MAX_BYTES });

/**
 * El logo llega como el cuerpo crudo del request (`Content-Type: image/png`, etc.), sin multipart.
 * El error de tamaño de `body-parser` no es una `HttpException` y el filtro global lo convertiria
 * en un 500: se traduce aca a un 413 con su codigo.
 */
@Injectable()
export class LogoBodyMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    parseImage(request, response, (error?: unknown) => {
      if (error === undefined || error === null) {
        next();
        return;
      }

      const status = typeof error === 'object' && 'status' in error ? error.status : undefined;
      try {
        if (status === 413) Exceptions.payloadTooLarge(Errors.LOGO_TOO_LARGE);
        Exceptions.badRequest(Errors.LOGO_INVALID_IMAGE);
      } catch (exception) {
        next(exception);
      }
    });
  }
}
