import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AllowPendingPasswordChange } from '@shared/common/decorators';
import { UserStatus } from '@shared/models/enums/user';

import config from '../config';
import * as DTO from '../dtos';
import { AdminAuth, type AuthenticatedAdmin, GetAdmin } from '../guards';
import * as Services from '../services';

const CREDENTIALS_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

/** Login, la cuenta propia y los demás administradores. */
@Controller()
export class AdminAccountsController {
  constructor(private readonly service: Services.Accounts) {}

  @Post('/auth/login')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIALS_THROTTLE)
  login(@Body() payload: DTO.Login) {
    return this.service.login(payload);
  }

  @Get('/me')
  @AdminAuth()
  @AllowPendingPasswordChange()
  me(@GetAdmin() admin: AuthenticatedAdmin) {
    return this.service.me(admin);
  }

  /** Devuelve una sesión nueva: los tokens anteriores dejan de servir. */
  @Post('/me/password')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIALS_THROTTLE)
  @AdminAuth()
  @AllowPendingPasswordChange()
  changePassword(@GetAdmin() admin: AuthenticatedAdmin, @Body() payload: DTO.ChangePassword) {
    return this.service.changePassword(admin, payload);
  }

  @Get('/admins')
  @AdminAuth()
  list() {
    return this.service.list();
  }

  @Post('/admins')
  @AdminAuth()
  create(@GetAdmin() admin: AuthenticatedAdmin, @Body() payload: DTO.CreateAdmin) {
    return this.service.create(admin, payload);
  }

  @Post('/admins/:adminUrn/deactivate')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  deactivate(@GetAdmin() admin: AuthenticatedAdmin, @Param('adminUrn') adminUrn: string) {
    return this.service.setStatus(admin, adminUrn, UserStatus.INACTIVE);
  }

  @Post('/admins/:adminUrn/reactivate')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  reactivate(@GetAdmin() admin: AuthenticatedAdmin, @Param('adminUrn') adminUrn: string) {
    return this.service.setStatus(admin, adminUrn, UserStatus.ACTIVE);
  }
}
