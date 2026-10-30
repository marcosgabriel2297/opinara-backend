import { Injectable, Logger } from '@nestjs/common';

import { BusinessesRepository } from '@shared/models/business';
import { BusinessStatus } from '@shared/models/enums/business';
import { CampaignsRepository, ScanEventsRepository } from '@packages/campaigns';
import { LocationsRepository } from '@packages/locations';

import config from '../config';
import * as DTO from '../dtos';

export interface ScanOptions {
  /** `HEAD` lo mandan previsualizadores y bots: se resuelve igual pero no se cuenta. */
  count: boolean;
}

@Injectable()
export class PublicCampaignsService {
  private readonly logger = new Logger(PublicCampaignsService.name);

  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly campaignsRepository: CampaignsRepository,
    private readonly scanEventsRepository: ScanEventsRepository,
    private readonly locationsRepository: LocationsRepository,
  ) {}

  /**
   * Escaneo del QR: cuenta y devuelve a donde redirigir.
   *
   * El QR lleva directo a Google, sin formulario propio en el medio: pedirle al cliente que
   * opine dos veces es perderlo. Por eso cada escaneo es tambien un envio a Google y se suman
   * los dos contadores en la misma operacion; asi el embudo historico sigue siendo comparable.
   *
   * Nunca falla hacia el cliente: si la campaña no sirve, se lo manda a la pagina de "no
   * disponible" del frontend, la misma para todos los casos.
   */
  async scan(params: DTO.CampaignParams, options: ScanOptions): Promise<string> {
    try {
      const resolved = await this.resolve(params);
      if (!resolved) {
        return config.UnavailableUrl;
      }

      if (options.count) {
        await this.campaignsRepository.increment(resolved.campaignUrn, ['scans', 'googleClicks']);
        // El evento con fecha es para la evolución; si falla, el escaneo ya se contó y el cliente
        // igual tiene que llegar a Google.
        await this.scanEventsRepository
          .record(resolved.businessUrn, resolved.campaignUrn)
          .catch((error: unknown) => this.logger.warn(`No se pudo registrar el escaneo con fecha: ${String(error)}`));
      }

      return resolved.googleReviewUrl;
    } catch (error) {
      // Un QR pegado en un mostrador no puede mostrar un JSON de error: mejor la pagina generica.
      this.logger.error(`Fallo resolviendo el QR ${params.businessSlug}/${params.campaignSlug}`, error);
      return config.UnavailableUrl;
    }
  }

  /**
   * Resuelve negocio, campaña y location desde los slugs publicos.
   * Cualquier problema da el mismo `null`: un endpoint anonimo no debe permitir deducir si
   * existe el negocio, si la campaña esta pausada o si falta el link de Google.
   */
  private async resolve(
    params: DTO.CampaignParams,
  ): Promise<{ businessUrn: string; campaignUrn: string; googleReviewUrl: string } | null> {
    const business = await this.businessesRepository.findBySlug(params.businessSlug);
    if (!business || business.status !== BusinessStatus.ACTIVE) {
      return null;
    }

    const campaign = await this.campaignsRepository.findActiveBySlug(business.urn, params.campaignSlug);
    if (!campaign) {
      return null;
    }

    const location = await this.locationsRepository.findForBusiness(business.urn, campaign.locationUrn);
    if (!location || !location.isActive || !location.newReviewUri) {
      return null;
    }

    return { businessUrn: business.urn, campaignUrn: campaign.urn, googleReviewUrl: location.newReviewUri };
  }
}
