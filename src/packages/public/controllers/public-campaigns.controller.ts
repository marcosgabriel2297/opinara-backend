import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { SubmitFeedbackDto } from '@packages/feedback/dtos/submit-feedback.dto';

import config from '../config';
import * as DTO from '../dtos';
import * as Services from '../services';

const PUBLIC_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

/**
 * Superficie publica: la ve cualquiera que escanee el QR, sin autenticacion.
 *
 * Solo se responde lo necesario para mostrar el formulario y el link a Google. Ningun
 * identificador interno, ningun dato del negocio mas alla de su nombre.
 */
@Controller('public/r/:businessSlug/:campaignSlug')
@Throttle(PUBLIC_THROTTLE)
export class PublicCampaignsController {
  constructor(private readonly service: Services.Campaigns) {}

  @Get()
  landing(@Param() params: DTO.CampaignParams) {
    return this.service.getLanding(params);
  }

  @Post('/feedback')
  feedback(@Param() params: DTO.CampaignParams, @Body() payload: SubmitFeedbackDto) {
    return this.service.submitFeedback(params, payload);
  }

  @Post('/google-click')
  @HttpCode(HttpStatus.NO_CONTENT)
  googleClick(@Param() params: DTO.CampaignParams) {
    return this.service.registerGoogleClick(params);
  }
}
