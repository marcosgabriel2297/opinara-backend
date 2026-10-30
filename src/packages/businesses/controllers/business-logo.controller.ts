import { Controller, Delete, Headers, Put, Req } from '@nestjs/common';
import { Request } from 'express';

import { BusinessAccess, GetBusiness, GetMembership } from '@shared/common/decorators';
import { Business, BusinessMember } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

import * as Services from '../services';

/**
 * El logo del business. Lo cambian el dueño y los admins, como el resto de lo que sale impreso.
 * `PUT` con la imagen como cuerpo crudo (ver `LogoBodyMiddleware`); responde el business
 * actualizado, con el `logoUpdatedAt` nuevo.
 */
@Controller('/:businessUrn/logo')
export class BusinessLogoController {
  constructor(private readonly service: Services.BusinessLogos) {}

  @Put()
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  save(
    @GetBusiness() business: Business,
    @GetMembership() membership: BusinessMember,
    @Req() request: Request,
    @Headers('content-type') contentType: string | undefined,
  ) {
    return this.service.save(business, membership, request.body, contentType);
  }

  @Delete()
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  remove(@GetBusiness() business: Business, @GetMembership() membership: BusinessMember) {
    return this.service.remove(business, membership);
  }
}
