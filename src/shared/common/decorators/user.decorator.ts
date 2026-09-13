import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedRequest } from '../guards/auth.guard';
import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AuthenticatedUser } from '../interfaces';

/** Devuelve el usuario autenticado. Solo valido en endpoints decorados con `@Auth()`. */
export const GetUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

  if (!request.user) {
    return Exceptions.unauthorized(Errors.UNAUTHORIZED);
  }

  return request.user;
});
