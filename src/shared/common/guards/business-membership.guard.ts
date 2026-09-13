import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import {
  BUSINESS_ENTITY,
  Business,
  BusinessMember,
  BusinessMembersRepository,
  BusinessesRepository,
} from '@shared/models/business';
import { BusinessMemberRole, BusinessStatus } from '@shared/models/enums/business';
import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AuthenticatedUser } from '../interfaces';
import { Urn } from '../urn';

export const BUSINESS_ROLES_KEY = 'business-roles';

export interface BusinessRequest extends Request {
  user?: AuthenticatedUser;
  membership?: BusinessMember;
  business?: Business;
}

/**
 * Autorizacion multi-tenant. Corre despues de `AuthGuard` y exige una membresia activa
 * del usuario en el `:businessUrn` de la ruta.
 *
 * Si no hay membresia responde 404 y no 403: un 403 confirmaria que ese business existe,
 * lo que permitiria enumerar negocios cambiando el id de la URL.
 */
@Injectable()
export class BusinessMembershipGuard implements CanActivate {
  constructor(
    private readonly membersRepository: BusinessMembersRepository,
    private readonly businessesRepository: BusinessesRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BusinessRequest>();

    if (!request.user) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    // Express puede entregar un array si el parametro llega repetido: solo se acepta un string.
    const param: unknown = request.params.businessUrn;
    if (typeof param !== 'string' || !Urn.isValid(param, BUSINESS_ENTITY)) {
      return Exceptions.notFound(Errors.BUSINESS_NOT_FOUND);
    }

    const [membership, business] = await Promise.all([
      this.membersRepository.findActiveMembership(param, request.user.urn),
      this.businessesRepository.one(param),
    ]);

    if (!membership || !business) {
      return Exceptions.notFound(Errors.BUSINESS_NOT_FOUND);
    }

    // El business existe y el usuario pertenece: si esta suspendido, 403 es informativo y correcto.
    if (business.status === BusinessStatus.SUSPENDED) {
      return Exceptions.forbidden(Errors.BUSINESS_SUSPENDED);
    }

    const roles = this.reflector.getAllAndOverride<BusinessMemberRole[] | undefined>(BUSINESS_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Ya sabemos que pertenece al business: si el rol no alcanza, 403 es la respuesta correcta.
    if (roles && roles.length > 0 && !roles.includes(membership.role)) {
      return Exceptions.forbidden(Errors.BUSINESS_FORBIDDEN);
    }

    request.membership = membership;
    // Se adjunta para que los handlers no vuelvan a consultar el mismo documento.
    request.business = business;

    return true;
  }
}
