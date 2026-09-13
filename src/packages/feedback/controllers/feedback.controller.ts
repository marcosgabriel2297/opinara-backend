import { Controller, Get, Query } from '@nestjs/common';

import { BusinessAccess, GetBusiness } from '@shared/common/decorators';
import { Business } from '@shared/models/business';

import * as DTO from '../dtos';
import * as Services from '../services';

@Controller('businesses/:businessUrn/feedback')
export class FeedbackController {
  constructor(private readonly service: Services.Feedback) {}

  @Get()
  @BusinessAccess()
  findAll(@GetBusiness() business: Business, @Query() query: DTO.ListFeedbackQuery) {
    return this.service.findAll(business.urn, query);
  }
}
