import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
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

  /** Alta de un usuario: no hay registro publico. */
  @Post('/users')
  @AdminAuth()
  createUser(@Body() payload: DTO.CreateUser) {
    return this.service.createUser(payload);
  }
}
