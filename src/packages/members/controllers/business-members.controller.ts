import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { BusinessAccess, GetBusiness, GetMembership, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business, BusinessMember } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

import * as DTO from '../dtos';
import * as Services from '../services';

/** El equipo de un business. Rutas completas: este modulo no esta en el `RouterModule`. */
@Controller('businesses/:businessUrn')
export class BusinessMembersController {
  constructor(private readonly service: Services.Members) {}

  @Get('/members')
  @BusinessAccess()
  team(@GetBusiness() business: Business, @GetMembership() membership: BusinessMember) {
    return this.service.team(business, membership);
  }

  @Post('/invitations')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  invite(
    @GetBusiness() business: Business,
    @GetMembership() membership: BusinessMember,
    @GetUser() user: AuthenticatedUser,
    @Body() payload: DTO.CreateInvitation,
  ) {
    return this.service.invite(business, membership, user, payload);
  }

  @Delete('/invitations/:invitationUrn')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  revokeInvitation(@GetBusiness() business: Business, @Param('invitationUrn') invitationUrn: string) {
    return this.service.revokeInvitation(business, invitationUrn);
  }

  @Patch('/members/:memberUrn')
  @BusinessAccess(BusinessMemberRole.OWNER)
  updateRole(
    @GetBusiness() business: Business,
    @Param('memberUrn') memberUrn: string,
    @Body() payload: DTO.UpdateMember,
  ) {
    return this.service.updateRole(business, memberUrn, payload);
  }

  /** Cualquier rol: quien no es OWNER puede irse; el resto de los permisos los decide el servicio. */
  @Delete('/members/:memberUrn')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BusinessAccess()
  remove(
    @GetBusiness() business: Business,
    @GetMembership() membership: BusinessMember,
    @Param('memberUrn') memberUrn: string,
  ) {
    return this.service.remove(business, membership, memberUrn);
  }
}
