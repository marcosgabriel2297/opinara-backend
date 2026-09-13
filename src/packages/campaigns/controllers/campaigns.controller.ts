import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { BusinessAccess, GetBusiness, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

import * as DTO from '../dtos';
import * as Services from '../services';

@Controller('businesses/:businessUrn/campaigns')
export class CampaignsController {
  constructor(private readonly service: Services.Campaigns) {}

  @Post()
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  create(@GetBusiness() business: Business, @GetUser() user: AuthenticatedUser, @Body() payload: DTO.CreateCampaign) {
    return this.service.create(business, user, payload);
  }

  @Get()
  @BusinessAccess()
  findAll(@GetBusiness() business: Business) {
    return this.service.findAll(business);
  }

  @Get('/:campaignUrn')
  @BusinessAccess()
  findOne(@GetBusiness() business: Business, @Param('campaignUrn') campaignUrn: string) {
    return this.service.findOne(business, campaignUrn);
  }

  @Post('/:campaignUrn/qr')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  generateQr(
    @GetBusiness() business: Business,
    @GetUser() user: AuthenticatedUser,
    @Param('campaignUrn') campaignUrn: string,
  ) {
    return this.service.generateQr(business, user, campaignUrn);
  }
}
