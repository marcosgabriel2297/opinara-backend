import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import config from '../config';
import * as DTO from '../dtos';
import { AdminAuth } from '../guards';
import * as Services from '../services';

const CREDENTIALS_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

@Controller()
export class AdminController {
  constructor(private readonly service: Services.Admin) {}

  @Post('/auth/login')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIALS_THROTTLE)
  login(@Body() payload: DTO.Login) {
    return this.service.login(payload);
  }

  @Get('/users')
  @AdminAuth()
  listUsers(@Query() query: DTO.ListUsers) {
    return this.service.listUsers(query);
  }

  /** Alta de un usuario: no hay registro publico. */
  @Post('/users')
  @AdminAuth()
  createUser(@Body() payload: DTO.CreateUser) {
    return this.service.createUser(payload);
  }

  /** Genera otra contraseña provisoria y cierra las sesiones del usuario. */
  @Post('/users/:userUrn/temporary-password')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  resetTemporaryPassword(@Param('userUrn') userUrn: string) {
    return this.service.resetTemporaryPassword(userUrn);
  }
}
