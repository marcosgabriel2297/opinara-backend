import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { UserStatus } from '@shared/models/enums/user';

import * as DTO from '../dtos';
import { AdminAuth, type AuthenticatedAdmin, GetAdmin } from '../guards';
import * as Services from '../services';

/** Los usuarios de los negocios. No hay registro público: los da de alta un admin. */
@Controller('users')
@AdminAuth()
export class AdminUsersController {
  constructor(private readonly service: Services.Users) {}

  @Get()
  list(@Query() query: DTO.ListUsers) {
    return this.service.listUsers(query);
  }

  @Post()
  create(@GetAdmin() admin: AuthenticatedAdmin, @Body() payload: DTO.CreateUser) {
    return this.service.createUser(admin, payload);
  }

  /** Genera otra contraseña provisoria y cierra las sesiones del usuario. */
  @Post('/:userUrn/temporary-password')
  @HttpCode(HttpStatus.OK)
  resetTemporaryPassword(@GetAdmin() admin: AuthenticatedAdmin, @Param('userUrn') userUrn: string) {
    return this.service.resetTemporaryPassword(admin, userUrn);
  }

  @Post('/:userUrn/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@GetAdmin() admin: AuthenticatedAdmin, @Param('userUrn') userUrn: string) {
    return this.service.setStatus(admin, userUrn, UserStatus.INACTIVE);
  }

  @Post('/:userUrn/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(@GetAdmin() admin: AuthenticatedAdmin, @Param('userUrn') userUrn: string) {
    return this.service.setStatus(admin, userUrn, UserStatus.ACTIVE);
  }
}
