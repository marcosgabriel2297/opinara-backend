import { applyDecorators, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../guards/auth.guard';

/** Protege un endpoint con el access token de la plataforma. */
export function Auth() {
  return applyDecorators(UseGuards(AuthGuard));
}
