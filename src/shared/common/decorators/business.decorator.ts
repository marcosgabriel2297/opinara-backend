import { applyDecorators, SetMetadata, UseGuards, createParamDecorator, ExecutionContext } from '@nestjs/common';

import { Business, BusinessMember } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AuthGuard } from '../guards/auth.guard';
import { BUSINESS_ROLES_KEY, BusinessMembershipGuard, BusinessRequest } from '../guards/business-membership.guard';

/**
 * Protege un endpoint anidado bajo `:businessUrn`: exige token valido y membresia activa.
 * Sin roles, cualquier miembro activo pasa; con roles, solo esos.
 */
export function BusinessAccess(...roles: BusinessMemberRole[]) {
  return applyDecorators(SetMetadata(BUSINESS_ROLES_KEY, roles), UseGuards(AuthGuard, BusinessMembershipGuard));
}

/** Business de la ruta, ya validado y cargado por el guard. Solo valido con `@BusinessAccess()`. */
export const GetBusiness = createParamDecorator((_data: unknown, ctx: ExecutionContext): Business => {
  const request = ctx.switchToHttp().getRequest<BusinessRequest>();

  if (!request.business) {
    return Exceptions.notFound(Errors.BUSINESS_NOT_FOUND);
  }

  return request.business;
});

/** Membresia del usuario en el business de la ruta. Solo valido con `@BusinessAccess()`. */
export const GetMembership = createParamDecorator((_data: unknown, ctx: ExecutionContext): BusinessMember => {
  const request = ctx.switchToHttp().getRequest<BusinessRequest>();

  if (!request.membership) {
    return Exceptions.forbidden(Errors.BUSINESS_FORBIDDEN);
  }

  return request.membership;
});
