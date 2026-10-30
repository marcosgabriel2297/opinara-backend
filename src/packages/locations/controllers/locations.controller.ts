import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { BusinessAccess, GetBusiness } from '@shared/common/decorators';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

import * as DTO from '../dtos';
import * as Services from '../services';

@Controller('businesses/:businessUrn/locations')
export class LocationsController {
  constructor(private readonly service: Services.Locations) {}

  /**
   * Alta manual, para operar antes de tener acceso a las APIs de Google.
   * La via normal es importar desde Google: `POST /businesses/:businessUrn/google/locations/import`.
   */
  @Post()
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  create(@GetBusiness() business: Business, @Body() payload: DTO.CreateLocation) {
    return this.service.createManual(business.urn, payload);
  }

  @Get()
  @BusinessAccess()
  findAll(@GetBusiness() business: Business) {
    return this.service.findAll(business.urn);
  }

  @Get('/:locationUrn')
  @BusinessAccess()
  findOne(@GetBusiness() business: Business, @Param('locationUrn') locationUrn: string) {
    return this.service.findOne(business.urn, locationUrn);
  }
}
