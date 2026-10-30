import { Injectable } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Business, BusinessMember, BusinessesRepository, toPublicBusiness } from '@shared/models/business';
import { BusinessStatus } from '@shared/models/enums/business';

import { BusinessWithRole } from '../interfaces';
import { detectLogoType, LogoContentType } from '../logo-image';
import { BusinessLogosRepository } from '../models';

export interface PublicLogo {
  data: Buffer;
  contentType: LogoContentType;
  /** Version vigente: la misma que viaja en `logoUpdatedAt` del business. */
  version: string;
}

/** Version del logo en la URL publica: el `getTime()` de `logoUpdatedAt`. */
export const logoVersion = (date: Date): string => String(date.getTime());

@Injectable()
export class BusinessLogosService {
  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly logosRepository: BusinessLogosRepository,
  ) {}

  /**
   * Reemplaza el logo. El cuerpo ya viene parseado como `Buffer` por `LogoBodyMiddleware`; si el
   * `Content-Type` no era de imagen, el cuerpo no es un `Buffer` y se rechaza igual.
   */
  async save(
    business: Business,
    membership: BusinessMember,
    body: unknown,
    declaredType: string | undefined,
  ): Promise<BusinessWithRole> {
    if (!Buffer.isBuffer(body) || body.length === 0) {
      Exceptions.badRequest(Errors.LOGO_INVALID_IMAGE);
    }

    const detected = detectLogoType(body);
    const declared = declaredType?.split(';')[0]?.trim().toLowerCase();
    if (detected === null || detected !== declared) {
      Exceptions.badRequest(Errors.LOGO_INVALID_IMAGE);
    }

    await this.logosRepository.save(business.urn, body, detected);
    return this.stamp(business, membership, { $set: { logoUpdatedAt: new Date() } });
  }

  async remove(business: Business, membership: BusinessMember): Promise<BusinessWithRole> {
    await this.logosRepository.remove(business.urn);
    return this.stamp(business, membership, { $unset: { logoUpdatedAt: 1 } });
  }

  /**
   * El logo que ve cualquiera (la pantalla del QR, la hoja impresa). Mismo `null` para negocio
   * inexistente, suspendido o sin logo: el endpoint publico no distingue entre los tres.
   */
  async findPublic(slug: string): Promise<PublicLogo | null> {
    const business = await this.businessesRepository.findBySlug(slug);
    if (business?.status !== BusinessStatus.ACTIVE || business.logoUpdatedAt === undefined) return null;

    const logo = await this.logosRepository.findByBusiness(business.urn);
    if (logo === null) return null;

    return { data: logo.data, contentType: logo.contentType, version: logoVersion(business.logoUpdatedAt) };
  }

  private async stamp(
    business: Business,
    membership: BusinessMember,
    update: Parameters<BusinessesRepository['updateOne']>[1],
  ): Promise<BusinessWithRole> {
    const updated = await this.businessesRepository.updateOne({ urn: business.urn }, update);
    if (updated === null) return Exceptions.notFound(Errors.BUSINESS_NOT_FOUND);

    return { ...toPublicBusiness(updated), role: membership.role };
  }
}
