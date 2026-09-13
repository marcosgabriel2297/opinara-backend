import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Auth, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';

import config from '../config';
import * as DTO from '../dtos';
import * as Services from '../services';

/** Limite estricto para los endpoints que aceptan credenciales (fuerza bruta / alta masiva). */
const CREDENTIALS_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

@Controller()
export class AuthenticationController {
  constructor(private readonly service: Services.Authentication) {}

  @Post('/register')
  @Throttle(CREDENTIALS_THROTTLE)
  register(@Body() payload: DTO.Register) {
    return this.service.register(payload);
  }

  @Post('/login')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIALS_THROTTLE)
  login(@Body() payload: DTO.Login) {
    return this.service.login(payload);
  }

  @Post('/refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIALS_THROTTLE)
  refresh(@Body() payload: DTO.Refresh) {
    return this.service.refresh(payload);
  }

  @Get('/me')
  @Auth()
  me(@GetUser() user: AuthenticatedUser) {
    return this.service.me(user.urn);
  }
}
