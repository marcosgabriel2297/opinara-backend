import { Injectable, Logger } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import {
  BUSINESS_ENTITY,
  BUSINESS_MEMBER_ENTITY,
  Business,
  BusinessMember,
  BusinessMembersRepository,
  BusinessesRepository,
  toPublicBusiness,
} from '@shared/models/business';
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@shared/models/enums/business';
import { isDuplicateKeyError, slugify } from '@shared/utils';

import * as DTO from '../dtos';
import { BusinessWithRole } from '../interfaces';

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);

  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly membersRepository: BusinessMembersRepository,
  ) {}

  async create(user: AuthenticatedUser, payload: DTO.CreateBusiness): Promise<BusinessWithRole> {
    const slug = slugify(payload.slug ?? payload.name);

    // Un nombre como "🍕🍕" no deja nada utilizable: decirle al usuario que el slug ya
    // existe lo manda a buscar un conflicto que no existe.
    if (slug.length < 2) {
      Exceptions.badRequest(Errors.SLUG_NOT_DERIVABLE);
    }

    if (await this.businessesRepository.findBySlug(slug)) {
      Exceptions.conflict(Errors.BUSINESS_SLUG_ALREADY_EXISTS);
    }

    const business = await this.createBusiness(user, payload, slug);

    try {
      await this.membersRepository.createOrUpdate({
        urn: Urn.createUUID(BUSINESS_MEMBER_ENTITY),
        businessUrn: business.urn,
        userUrn: user.urn,
        role: BusinessMemberRole.OWNER,
        status: BusinessMemberStatus.ACTIVE,
      });
    } catch (error) {
      // Sin la membresia el business queda inaccesible para todos: se revierte la creacion.
      this.logger.error(`Rolling back business ${business.urn}: could not create owner membership`);
      await this.businessesRepository.deleteOne({ urn: business.urn });
      throw error;
    }

    return { ...toPublicBusiness(business), role: BusinessMemberRole.OWNER };
  }

  /** Solo los businesses donde el usuario tiene membresia activa. */
  async findAllForUser(user: AuthenticatedUser): Promise<BusinessWithRole[]> {
    const memberships = await this.membersRepository.findActiveByUser(user.urn);
    if (memberships.length === 0) {
      return [];
    }

    const roleByBusiness = new Map(memberships.map((membership) => [membership.businessUrn, membership.role]));
    const businesses = await this.businessesRepository.findByUrns([...roleByBusiness.keys()]);

    return businesses.map((business) => ({
      ...toPublicBusiness(business),
      role: roleByBusiness.get(business.urn) ?? BusinessMemberRole.MEMBER,
    }));
  }

  /** El guard ya valido membresia y estado del business, y lo dejo cargado en el request. */
  findOne(business: Business, membership: BusinessMember): BusinessWithRole {
    return { ...toPublicBusiness(business), role: membership.role };
  }

  private async createBusiness(user: AuthenticatedUser, payload: DTO.CreateBusiness, slug: string): Promise<Business> {
    try {
      return await this.businessesRepository.createOrUpdate({
        urn: Urn.createUUID(BUSINESS_ENTITY),
        name: payload.name.trim(),
        slug,
        ownerUserUrn: user.urn,
        status: BusinessStatus.ACTIVE,
        timezone: payload.timezone,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        Exceptions.conflict(Errors.BUSINESS_SLUG_ALREADY_EXISTS);
      }

      throw error;
    }
  }
}
