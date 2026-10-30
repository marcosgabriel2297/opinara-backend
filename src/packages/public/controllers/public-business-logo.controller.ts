import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';

import { Services as BusinessServices } from '@packages/businesses';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';

import config from '../config';
import * as DTO from '../dtos';

/** Los logos se piden mucho mas que los escaneos (cada pantalla del dashboard): limite propio. */
const LOGO_THROTTLE = { default: { limit: config.Throttle.Limit * 4, ttl: config.Throttle.Ttl } };

/**
 * El logo del negocio, sin autenticacion: lo muestran la pantalla del QR, la hoja impresa y el
 * dashboard. Con `?v=` igual a la version vigente se cachea para siempre (la URL cambia al
 * cambiar el logo); sin version, cinco minutos.
 */
@Controller('public/businesses/:businessSlug/logo')
@Throttle(LOGO_THROTTLE)
export class PublicBusinessLogoController {
  constructor(private readonly logos: BusinessServices.BusinessLogos) {}

  @Get()
  async logo(
    @Param() params: DTO.BusinessSlugParams,
    @Query('v') version: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const logo = await this.logos.findPublic(params.businessSlug);
    if (logo === null) return Exceptions.notFound(Errors.LOGO_NOT_FOUND);

    response.setHeader('Content-Type', logo.contentType);
    response.setHeader(
      'Cache-Control',
      version === logo.version ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    );
    // `helmet` deja `same-origin`: el frontend vive en otro origen y tiene que poder mostrarla.
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('X-Robots-Tag', 'noindex');
    response.send(logo.data);
  }
}
