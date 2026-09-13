import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common';

import { BusinessAccess, GetBusiness } from '@shared/common/decorators';
import { Business } from '@shared/models/business';

import * as DTO from '../dtos';
import * as Services from '../services';

@Controller('businesses/:businessUrn/locations/:locationUrn/reviews')
export class ReviewsController {
  constructor(private readonly service: Services.Reviews) {}

  @Get()
  @BusinessAccess()
  findAll(
    @GetBusiness() business: Business,
    @Param('locationUrn') locationUrn: string,
    @Query() query: DTO.ListReviewsQuery,
  ) {
    return this.service.findAll(business.urn, locationUrn, query);
  }

  @Get('/:reviewUrn')
  @BusinessAccess()
  findOne(
    @GetBusiness() business: Business,
    @Param('locationUrn') locationUrn: string,
    @Param('reviewUrn') reviewUrn: string,
  ) {
    return this.service.findOne(business.urn, locationUrn, reviewUrn);
  }

  /** PUT y no POST: `updateReply` de Google crea la respuesta si no existe y la edita si ya esta. */
  @Put('/:reviewUrn/reply')
  @BusinessAccess()
  reply(
    @GetBusiness() business: Business,
    @Param('locationUrn') locationUrn: string,
    @Param('reviewUrn') reviewUrn: string,
    @Body() payload: DTO.ReplyReview,
  ) {
    return this.service.reply(business.urn, locationUrn, reviewUrn, payload);
  }

  @Delete('/:reviewUrn/reply')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BusinessAccess()
  deleteReply(
    @GetBusiness() business: Business,
    @Param('locationUrn') locationUrn: string,
    @Param('reviewUrn') reviewUrn: string,
  ) {
    return this.service.deleteReply(business.urn, locationUrn, reviewUrn);
  }
}
