import { Body, Controller, Get, Post } from '@nestjs/common';

import { Auth, BusinessAccess, GetBusiness, GetMembership, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business, BusinessMember } from '@shared/models/business';

import * as DTO from '../dtos';
import * as Services from '../services';

@Controller()
export class BusinessesController {
  constructor(private readonly service: Services.Businesses) {}

  @Post()
  @Auth()
  create(@GetUser() user: AuthenticatedUser, @Body() payload: DTO.CreateBusiness) {
    return this.service.create(user, payload);
  }

  @Get()
  @Auth()
  findAll(@GetUser() user: AuthenticatedUser) {
    return this.service.findAllForUser(user);
  }

  @Get('/:businessUrn')
  @BusinessAccess()
  findOne(@GetBusiness() business: Business, @GetMembership() membership: BusinessMember) {
    return this.service.findOne(business, membership);
  }
}
