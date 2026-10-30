import { Controller, Get, Param, Req, Res, UseFilters } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { ThrottleKeyParams } from '@shared/common/throttling';

import config from '../config';
import * as DTO from '../dtos';
import { ThrottledScanFilter } from '../filters';
import * as Services from '../services';

const PUBLIC_THROTTLE = { default: { limit: config.Throttle.Limit, ttl: config.Throttle.Ttl } };

/**
 * Superficie publica: la ve cualquiera que escanee el QR, sin autenticacion.
 *
 * No devuelve datos: redirige. Ni identificadores internos ni nada del negocio viaja al cliente,
 * solo el `Location` hacia Google (o hacia la pagina de "no disponible").
 */
@Controller('public/r/:businessSlug/:campaignSlug')
@Throttle(PUBLIC_THROTTLE)
// Por IP y campaña: el wifi de un local lleno no se queda sin escaneos, ni le saca cupo a otro QR.
@ThrottleKeyParams('businessSlug', 'campaignSlug')
// Pasado el limite, una pagina que reintenta sola en vez de un JSON en el telefono del cliente.
@UseFilters(ThrottledScanFilter)
export class PublicCampaignsController {
  constructor(private readonly service: Services.Campaigns) {}

  @Get()
  async scan(@Param() params: DTO.CampaignParams, @Req() request: Request, @Res() response: Response): Promise<void> {
    const target = await this.service.scan(params, { count: request.method === 'GET' });

    // Sin cache: si el navegador recordara el 302, el segundo escaneo desde el mismo telefono
    // iria directo a Google sin pasar por aca y no se contaria.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.redirect(302, target);
  }
}
