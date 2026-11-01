import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { BusinessStatus } from '@shared/models/enums/business';

import * as DTO from '../dtos';
import { AdminAuth, type AuthenticatedAdmin, GetAdmin } from '../guards';
import * as Services from '../services';

@Controller('businesses')
@AdminAuth()
export class AdminBusinessesController {
  constructor(private readonly service: Services.Businesses) {}

  /** Negocios con sus sucursales, sin paginar: alimentan los filtros del panel. */
  @Get('/options')
  options() {
    return this.service.options();
  }

  @Get()
  list(@Query() query: DTO.ListBusinesses) {
    return this.service.list(query);
  }

  @Get('/:businessUrn')
  detail(@Param('businessUrn') businessUrn: string) {
    return this.service.detail(businessUrn);
  }

  @Post('/:businessUrn/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(@GetAdmin() admin: AuthenticatedAdmin, @Param('businessUrn') businessUrn: string) {
    return this.service.setStatus(admin, businessUrn, BusinessStatus.SUSPENDED);
  }

  @Post('/:businessUrn/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@GetAdmin() admin: AuthenticatedAdmin, @Param('businessUrn') businessUrn: string) {
    return this.service.setStatus(admin, businessUrn, BusinessStatus.ACTIVE);
  }
}
