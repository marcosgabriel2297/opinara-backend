import { applyDecorators, SetMetadata, UseGuards, createParamDecorator, ExecutionContext } from '@nestjs/common';

import { Business, BusinessMember } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { Feature } from '@shared/models/enums/plan';
import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AuthGuard } from '../guards/auth.guard';
import {
  BUSINESS_FEATURE_KEY,
  BUSINESS_ROLES_KEY,
  BusinessMembershipGuard,
  BusinessRequest,
} from '../guards/business-membership.guard';

/**
 * Protege un endpoint anidado bajo `:businessUrn`: exige token valido y membresia activa.
 * Sin roles, cualquier miembro activo pasa; con roles, solo esos.
 */
export function BusinessAccess(...roles: BusinessMemberRole[]) {
  return applyDecorators(SetMetadata(BUSINESS_ROLES_KEY, roles), UseGuards(AuthGuard, BusinessMembershipGuard));
}

/**
 * Exige que el plan del negocio incluya la funcionalidad. Va junto a `@BusinessAccess()` (sobre el
 * controller o el handler): lo chequea el mismo guard, despues de la membresia.
 */
export const RequiresFeature = (feature: Feature) => SetMetadata(BUSINESS_FEATURE_KEY, feature);

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
