import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Auth, GetUser } from '@shared/common/decorators';
import { AuthenticatedUser } from '@shared/common/interfaces';

import config from '../config';
import * as DTO from '../dtos';
import * as Services from '../services';

const INVITATION_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

/**
 * Del lado de quien recibe la invitacion. El token va en el cuerpo (`POST`), no en la URL: asi no
 * queda en logs de servidores ni proxies.
 */
@Controller('invitations')
@Throttle(INVITATION_THROTTLE)
export class InvitationsController {
  constructor(private readonly service: Services.Members) {}

  @Post('/lookup')
  @HttpCode(HttpStatus.OK)
  lookup(@Body() payload: DTO.InvitationToken) {
    return this.service.lookup(payload);
  }

  @Post('/accept')
  @HttpCode(HttpStatus.OK)
  @Auth()
  accept(@GetUser() user: AuthenticatedUser, @Body() payload: DTO.InvitationToken) {
    return this.service.accept(user, payload);
  }
}
