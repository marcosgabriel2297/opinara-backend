import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { AllowPendingPasswordChange, Auth, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';

import config from '../config';
import * as DTO from '../dtos';
import * as Services from '../services';

/** Limite estricto para los endpoints que aceptan credenciales (fuerza bruta). */
const CREDENTIALS_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

@Controller()
export class AuthenticationController {
  constructor(private readonly service: Services.Authentication) {}

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

  /** Cierra la sesion de este dispositivo. No pide access token: puede estar vencido. */
  @Post('/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(CREDENTIALS_THROTTLE)
  logout(@Body() payload: DTO.Logout) {
    return this.service.logout(payload);
  }

  @Post('/logout/all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth()
  @AllowPendingPasswordChange()
  logoutEverywhere(@GetUser() user: AuthenticatedUser) {
    return this.service.logoutEverywhere(user.urn);
  }

  /** Siempre 202, exista o no la cuenta: no sirve para averiguar que emails estan registrados. */
  @Post('/password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(CREDENTIALS_THROTTLE)
  forgotPassword(@Body() payload: DTO.ForgotPassword) {
    return this.service.forgotPassword(payload);
  }

  @Post('/password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(CREDENTIALS_THROTTLE)
  resetPassword(@Body() payload: DTO.ResetPassword) {
    return this.service.resetPassword(payload);
  }

  /** Con la contraseña provisoria del alta es lo unico que se puede hacer. */
  @Post('/password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(CREDENTIALS_THROTTLE)
  @Auth()
  @AllowPendingPasswordChange()
  changePassword(@GetUser() user: AuthenticatedUser, @Body() payload: DTO.ChangePassword) {
    return this.service.changePassword(user, payload);
  }

  @Get('/me')
  @Auth()
  @AllowPendingPasswordChange()
  me(@GetUser() user: AuthenticatedUser) {
    return this.service.me(user.urn);
  }
}
