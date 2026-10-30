import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';

import { ALLOW_PENDING_PASSWORD_CHANGE, AuthGuard } from '../guards/auth.guard';

/** Protege un endpoint con el access token de la plataforma. */
export function Auth() {
  return applyDecorators(UseGuards(AuthGuard));
}

/**
 * Endpoints que un usuario con la contraseña provisoria del alta puede usar igual: los que
 * necesita para cambiarla (o para salir). El resto responde `PASSWORD_CHANGE_REQUIRED`.
 */
export function AllowPendingPasswordChange() {
  return SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);
}
