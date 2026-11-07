import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';

import config from '../config';
import * as DTO from '../dtos';
import * as Services from '../services';

const READ_THROTTLE = { default: config.Throttle.Read };

/**
 * Superficie publica de la tarjeta de sellos, sin autenticacion. Nada se cachea ni se indexa: la
 * tarjeta tiene datos personales y el link es el secreto.
 *
 * No existe un endpoint publico que sume sellos: eso lo hace la caja, autenticada.
 */
@Controller('public/loyalty')
export class PublicLoyaltyController {
  constructor(private readonly service: Services.Public) {}

  /** La tarjeta. El token viaja en un header: en la URL del frontend va despues de `#`. */
  @Get('/card')
  @Throttle(READ_THROTTLE)
  card(@Headers(config.CardTokenHeader) token: string | undefined, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.service.card(token);
  }

  @Delete('/card')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(READ_THROTTLE)
  deleteCard(
    @Headers(config.CardTokenHeader) token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    noStore(response);
    return this.service.deleteCard(token);
  }

  @Post('/card/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: config.Throttle.Resend })
  resend(@Body() payload: DTO.ResendCard) {
    return this.service.resend(payload);
  }

  @Get('/:businessSlug/:programSlug')
  @Throttle(READ_THROTTLE)
  signup(@Param() params: DTO.ProgramParams, @Res({ passthrough: true }) response: Response) {
    noStore(response);
    return this.service.signup(params);
  }

  @Post('/:businessSlug/:programSlug/members')
  @Throttle({ default: config.Throttle.Register })
  register(
    @Param() params: DTO.ProgramParams,
    @Body() payload: DTO.Register,
    @Res({ passthrough: true }) response: Response,
  ) {
    noStore(response);
    return this.service.register(params, payload);
  }
}

const noStore = (response: Response): void => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('Referrer-Policy', 'no-referrer');
};
