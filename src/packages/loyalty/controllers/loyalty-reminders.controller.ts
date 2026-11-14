import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';

import { BusinessAccess, GetBusiness, GetUser, RequiresFeature } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { Feature } from '@shared/models/enums/plan';

import * as DTO from '../dtos';
import * as Services from '../services';

/**
 * Recordatorios por WhatsApp recomendados para mandar. Solo OWNER y ADMIN: usan el contacto del
 * cliente para algo promocional.
 */
@Controller('businesses/:businessUrn/loyalty')
@RequiresFeature(Feature.LOYALTY)
export class LoyaltyRemindersController {
  constructor(private readonly service: Services.Reminders) {}

  @Get('/reminders')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  list(@GetBusiness() business: Business, @Query() query: DTO.ListReminders) {
    return this.service.list(business, query);
  }

  /** El local abrio WhatsApp para mandarle el recordatorio. */
  @Post('/reminders/:memberCode/sent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  markSent(
    @GetBusiness() business: Business,
    @GetUser() user: AuthenticatedUser,
    @Param('memberCode') memberCode: string,
  ) {
    return this.service.markSent(business, user, memberCode);
  }

  /** Dejar de mandarle recordatorios porque lo pidio, o volver a mandarle. */
  @Put('/members/:memberCode/reminders')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  setForMember(
    @GetBusiness() business: Business,
    @GetUser() user: AuthenticatedUser,
    @Param('memberCode') memberCode: string,
    @Body() body: DTO.SetReminders,
  ) {
    return this.service.setForMember(business, user, memberCode, body);
  }
}
