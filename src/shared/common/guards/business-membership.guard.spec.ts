import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Business, BusinessMember, BusinessMembersRepository, BusinessesRepository } from '@shared/models/business';
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@shared/models/enums/business';
import { BUSINESS_ROLES_KEY, BusinessMembershipGuard, BusinessRequest } from './business-membership.guard';

const BUSINESS_URN = 'urn:business:11111111-1111-1111-1111-111111111111';
const USER = { urn: 'urn:user:22222222-2222-2222-2222-222222222222', email: 'due@no.test' };

const membershipWith = (role: BusinessMemberRole): BusinessMember => ({
  urn: 'urn:business-member:33333333-3333-3333-3333-333333333333',
  businessUrn: BUSINESS_URN,
  userUrn: USER.urn,
  role,
  status: BusinessMemberStatus.ACTIVE,
});

const buildContext = (request: Partial<BusinessRequest>): { context: ExecutionContext; request: BusinessRequest } => {
  const fullRequest = { params: {}, ...request } as BusinessRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => fullRequest }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { context, request: fullRequest };
};

const businessWith = (status: BusinessStatus): Business => ({
  urn: BUSINESS_URN,
  name: 'Negocio',
  slug: 'negocio',
  ownerUserUrn: USER.urn,
  status,
});

const buildGuard = (
  membership: BusinessMember | null,
  roles?: BusinessMemberRole[],
  business: Business | null = businessWith(BusinessStatus.ACTIVE),
) => {
  const repository = { findActiveMembership: jest.fn().mockResolvedValue(membership) };
  const businesses = { one: jest.fn().mockResolvedValue(business) };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;

  return {
    guard: new BusinessMembershipGuard(
      repository as unknown as BusinessMembersRepository,
      businesses as unknown as BusinessesRepository,
      reflector,
    ),
    repository,
    businesses,
    reflector,
  };
};

describe('BusinessMembershipGuard', () => {
  it('deja pasar a un miembro activo y expone la membresia', async () => {
    const membership = membershipWith(BusinessMemberRole.MEMBER);
    const { guard, repository } = buildGuard(membership);
    const { context, request } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(repository.findActiveMembership).toHaveBeenCalledWith(BUSINESS_URN, USER.urn);
    expect(request.membership).toBe(membership);
    // El business queda cargado para que el handler no repita la consulta.
    expect(request.business).toMatchObject({ urn: BUSINESS_URN });
  });

  it('responde 404 si el business ya no existe aunque quede la membresia', async () => {
    const { guard } = buildGuard(membershipWith(BusinessMemberRole.OWNER), undefined, null);
    const { context } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloquea con 403 un business suspendido', async () => {
    const { guard } = buildGuard(
      membershipWith(BusinessMemberRole.OWNER),
      undefined,
      businessWith(BusinessStatus.SUSPENDED),
    );
    const { context } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('responde 404 -no 403- cuando no hay membresia, para no delatar que el business existe', async () => {
    const { guard } = buildGuard(null);
    const { context } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('responde 403 cuando el rol no alcanza', async () => {
    const { guard } = buildGuard(membershipWith(BusinessMemberRole.MEMBER), [BusinessMemberRole.OWNER]);
    const { context } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('acepta cualquiera de los roles permitidos', async () => {
    const { guard } = buildGuard(membershipWith(BusinessMemberRole.ADMIN), [
      BusinessMemberRole.OWNER,
      BusinessMemberRole.ADMIN,
    ]);
    const { context } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('no consulta la base con urns invalidos, parametros repetidos o inyecciones', async () => {
    const invalidParams: unknown[] = [
      undefined,
      'no-es-un-urn',
      'urn:user:1234',
      [BUSINESS_URN, BUSINESS_URN],
      { $ne: null },
    ];

    for (const param of invalidParams) {
      const { guard, repository } = buildGuard(membershipWith(BusinessMemberRole.OWNER));
      const { context } = buildContext({ user: USER, params: { businessUrn: param } as BusinessRequest['params'] });

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findActiveMembership).not.toHaveBeenCalled();
    }
  });

  it('rechaza pedidos sin usuario autenticado', async () => {
    const { guard } = buildGuard(membershipWith(BusinessMemberRole.OWNER));
    const { context } = buildContext({ params: { businessUrn: BUSINESS_URN } });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lee los roles requeridos del handler y de la clase', async () => {
    const { guard, reflector } = buildGuard(membershipWith(BusinessMemberRole.OWNER), [BusinessMemberRole.OWNER]);
    const { context } = buildContext({ user: USER, params: { businessUrn: BUSINESS_URN } });

    await guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(BUSINESS_ROLES_KEY, expect.any(Array));
  });
});
