import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { ErrorMessages, Errors } from '../errors';

/**
 * Punto unico para lanzar excepciones de dominio: el cliente siempre recibe
 * `{ message, errorCode }` con un codigo estable del enum `Errors`.
 */
export class Exceptions {
  static badRequest(errorKey: Errors): never {
    throw new BadRequestException(ErrorMessages[errorKey], errorKey);
  }

  static unauthorized(errorKey: Errors = Errors.WRONG_CREDENTIALS): never {
    throw new UnauthorizedException(ErrorMessages[errorKey], errorKey);
  }

  static forbidden(errorKey: Errors): never {
    throw new ForbiddenException(ErrorMessages[errorKey], errorKey);
  }

  static notFound(errorKey: Errors): never {
    throw new NotFoundException(ErrorMessages[errorKey], errorKey);
  }

  static conflict(errorKey: Errors): never {
    throw new ConflictException(ErrorMessages[errorKey], errorKey);
  }

  static unavailable(errorKey: Errors): never {
    throw new ServiceUnavailableException(ErrorMessages[errorKey], errorKey);
  }

  static internal(errorKey: Errors = Errors.INTERNAL_SERVER_ERROR): never {
    throw new InternalServerErrorException(ErrorMessages[errorKey], errorKey);
  }
}
