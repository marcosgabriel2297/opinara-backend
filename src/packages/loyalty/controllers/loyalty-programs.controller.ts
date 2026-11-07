import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { BusinessAccess, GetBusiness, GetUser, RequiresFeature } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { Feature } from '@shared/models/enums/plan';

import * as DTO from '../dtos';
import * as Services from '../services';

/** Configuracion de los programas, uno por sucursal. La caja los lista para elegir en cual esta. */
@Controller('businesses/:businessUrn/loyalty/programs')
@RequiresFeature(Feature.LOYALTY)
export class LoyaltyProgramsController {
  constructor(private readonly service: Services.Programs) {}

  @Get()
  @BusinessAccess()
  findAll(@GetBusiness() business: Business) {
    return this.service.findAll(business);
  }

  @Post()
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  create(@GetBusiness() business: Business, @GetUser() user: AuthenticatedUser, @Body() payload: DTO.CreateProgram) {
    return this.service.create(business, user, payload);
  }

  @Get('/:programUrn')
  @BusinessAccess()
  findOne(@GetBusiness() business: Business, @Param('programUrn') programUrn: string) {
    return this.service.findOne(business, programUrn);
  }

  @Patch('/:programUrn')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  update(
    @GetBusiness() business: Business,
    @Param('programUrn') programUrn: string,
    @Body() payload: DTO.UpdateProgram,
  ) {
    return this.service.update(business, programUrn, payload);
  }

  /** Como el de las campañas: un POST idempotente, solo para quien puede imprimirlo. */
  @Post('/:programUrn/qr')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  generateQr(@GetBusiness() business: Business, @Param('programUrn') programUrn: string) {
    return this.service.generateQr(business, programUrn);
  }
}
