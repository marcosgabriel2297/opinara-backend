import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

import config from '../config';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Quien escanea navega a esta URL (no la pide con `fetch`): un `429` con JSON era lo que veia en
 * el telefono, sin llegar a Google. Pasado el limite se lo manda a una pagina del frontend que
 * espera unos segundos y reintenta sola. El escaneo cortado no se cuenta: se cuenta el reintento.
 *
 * Con slugs que no tienen formato de slug (el guard corre antes que la validacion), a la pagina
 * de "no disponible", la misma de siempre para un QR que no sirve.
 */
@Catch(ThrottlerException)
export class ThrottledScanFilter implements ExceptionFilter {
  private readonly logger = new Logger(ThrottledScanFilter.name);

  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const businessSlug = String(request.params.businessSlug ?? '');
    const campaignSlug = String(request.params.campaignSlug ?? '');

    const valid = SLUG.test(businessSlug) && SLUG.test(campaignSlug);
    this.logger.warn(`Scan throttled for ${valid ? `${businessSlug}/${campaignSlug}` : 'invalid slugs'}`);

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.redirect(302, valid ? config.BusyUrl(businessSlug, campaignSlug) : config.UnavailableUrl);
  }
}
