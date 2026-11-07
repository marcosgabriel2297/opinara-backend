import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { BusinessAccess, GetBusiness, GetUser, RequiresFeature } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { Feature } from '@shared/models/enums/plan';

import * as DTO from '../dtos';
import * as Services from '../services';

/**
 * La caja. Cualquier miembro del negocio puede buscar, sumar, canjear y deshacer; borrar a un
 * cliente queda para OWNER y ADMIN.
 */
@Controller('businesses/:businessUrn/loyalty')
@RequiresFeature(Feature.LOYALTY)
export class LoyaltyMembersController {
  constructor(private readonly service: Services.Members) {}

  @Get('/programs/:programUrn/members')
  @BusinessAccess()
  search(@GetBusiness() business: Business, @Param('programUrn') programUrn: string, @Query() query: DTO.ListMembers) {
    return this.service.search(business, programUrn, query);
  }

  @Post('/programs/:programUrn/members/:memberCode/stamps')
  @BusinessAccess()
  stamp(
    @GetBusiness() business: Business,
    @GetUser() user: AuthenticatedUser,
    @Param('programUrn') programUrn: string,
    @Param('memberCode') memberCode: string,
  ) {
    return this.service.stamp(business, user, programUrn, memberCode);
  }

  @Post('/programs/:programUrn/members/:memberCode/redemptions')
  @BusinessAccess()
  redeem(
    @GetBusiness() business: Business,
    @GetUser() user: AuthenticatedUser,
    @Param('programUrn') programUrn: string,
    @Param('memberCode') memberCode: string,
  ) {
    return this.service.redeem(business, user, programUrn, memberCode);
  }

  @Post('/events/:eventUrn/undo')
  @HttpCode(HttpStatus.OK)
  @BusinessAccess()
  undo(@GetBusiness() business: Business, @GetUser() user: AuthenticatedUser, @Param('eventUrn') eventUrn: string) {
    return this.service.undo(business, user, eventUrn);
  }

  /** Lo que lee la caja al escanear: dice de que sucursal es la tarjeta. */
  @Get('/members/:memberCode')
  @BusinessAccess()
  findByCode(@GetBusiness() business: Business, @Param('memberCode') memberCode: string) {
    return this.service.findByCode(business, memberCode);
  }

  /** El link actual, sin cambiarlo: para mandarlo por WhatsApp o mostrarlo como QR. */
  @Get('/members/:memberCode/card-link')
  @BusinessAccess()
  currentCardLink(@GetBusiness() business: Business, @Param('memberCode') memberCode: string) {
    return this.service.currentCardLink(business, memberCode);
  }

  /** Link nuevo (por si el anterior se filtró); el anterior deja de andar. */
  @Post('/members/:memberCode/card-link')
  @HttpCode(HttpStatus.OK)
  @BusinessAccess()
  regenerateCardLink(@GetBusiness() business: Business, @Param('memberCode') memberCode: string) {
    return this.service.regenerateCardLink(business, memberCode);
  }

  @Delete('/members/:memberCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  remove(@GetBusiness() business: Business, @Param('memberCode') memberCode: string) {
    return this.service.remove(business, memberCode);
  }
}
