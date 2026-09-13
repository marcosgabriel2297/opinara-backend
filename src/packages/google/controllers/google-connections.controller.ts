import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';

import { BusinessAccess, GetBusiness, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

import * as DTO from '../dtos';
import * as Services from '../services';

/**
 * Endpoints de gestion de la conexion con Google. Conectar y desconectar quedan
 * restringidos a OWNER: son acciones que afectan a todo el negocio.
 */
@Controller('businesses/:businessUrn/google')
export class GoogleConnectionsController {
  constructor(
    private readonly connections: Services.Connections,
    private readonly profile: Services.Profile,
  ) {}

  @Post('/connect')
  @BusinessAccess(BusinessMemberRole.OWNER)
  connect(@GetBusiness() business: Business, @GetUser() user: AuthenticatedUser) {
    return this.connections.startAuthorization(business, user);
  }

  @Get('/connection')
  @BusinessAccess()
  status(@GetBusiness() business: Business) {
    return this.connections.getStatus(business.urn);
  }

  @Delete('/connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @BusinessAccess(BusinessMemberRole.OWNER)
  disconnect(@GetBusiness() business: Business) {
    return this.connections.disconnect(business.urn);
  }

  @Get('/accounts')
  @BusinessAccess()
  accounts(@GetBusiness() business: Business) {
    return this.profile.listAccounts(business.urn);
  }

  @Get('/locations')
  @BusinessAccess()
  locations(@GetBusiness() business: Business, @Query() query: DTO.ListLocationsQuery) {
    return this.profile.listAvailableLocations(business.urn, query.accountName);
  }

  @Post('/locations/import')
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  import(@GetBusiness() business: Business, @Body() payload: DTO.ImportLocations) {
    return this.profile.importLocations(business.urn, payload);
  }
}
