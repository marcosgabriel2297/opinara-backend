import { Controller, Get, Param } from '@nestjs/common';

import { BusinessAccess, GetBusiness } from '@shared/common/decorators';
import { Business } from '@shared/models/business';

import * as Services from '../services';

@Controller('businesses/:businessUrn/locations')
export class LocationsController {
  constructor(private readonly service: Services.Locations) {}

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
