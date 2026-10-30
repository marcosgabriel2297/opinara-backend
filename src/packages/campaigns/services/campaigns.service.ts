import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import { Business } from '@shared/models/business';
import { CampaignStatus } from '@shared/models/enums/campaign';
import { isDuplicateKeyError, slugify } from '@shared/utils';
import { LocationsService } from '@packages/locations';

import config from '../config';
import * as DTO from '../dtos';
import {
  CAMPAIGN_ENTITY,
  Campaign,
  CampaignsRepository,
  PublicCampaign,
  QR_CODE_ENTITY,
  QRCodesRepository,
  ScanEventsRepository,
} from '../models';
import { lastMondays } from './scan-weeks';

export interface GeneratedQr {
  targetUrl: string;
  /** PNG en base64 listo para mostrar o descargar. */
  pngDataUrl: string;
}

export interface ScansByWeek {
  /** Una entrada por semana, de la más vieja a la actual (lunes en la zona horaria del negocio). */
  weeks: { week: string; scans: number }[];
  /** Desde cuándo hay escaneos con fecha. Los anteriores están en el total pero no acá. */
  trackedSince: Date | null;
}

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly campaignsRepository: CampaignsRepository,
    private readonly qrCodesRepository: QRCodesRepository,
    private readonly scanEventsRepository: ScanEventsRepository,
    private readonly locationsService: LocationsService,
  ) {}

  /**
   * Escaneos por semana del negocio entero o de una campaña. Las semanas sin escaneos vienen en
   * 0: el gráfico no tiene que adivinar huecos.
   */
  async scansByWeek(business: Business, weeks: number, campaignUrn?: string): Promise<ScansByWeek> {
    if (campaignUrn !== undefined) {
      await this.getOwned(business.urn, campaignUrn);
    }

    const timezone = business.timezone ?? DEFAULT_TIMEZONE;
    const mondays = lastMondays(timezone, weeks);
    // Un día de margen antes del primer lunes: el filtro es por instante y la semana por zona.
    const since = new Date(Date.parse(`${mondays[0]}T00:00:00Z`) - 24 * 60 * 60 * 1000);

    const [counts, trackedSince] = await Promise.all([
      this.scanEventsRepository.weekly(business.urn, since, timezone, campaignUrn),
      this.scanEventsRepository.firstScanAt(business.urn, campaignUrn),
    ]);
    const byWeek = new Map(counts.map((count) => [count.week, count.scans]));

    return { weeks: mondays.map((week) => ({ week, scans: byWeek.get(week) ?? 0 })), trackedSince };
  }

  async create(business: Business, user: AuthenticatedUser, payload: DTO.CreateCampaign): Promise<PublicCampaign> {
    const location = await this.locationsService.getOwned(business.urn, payload.locationUrn);

    // Sin link de Google la campaña no tiene a donde mandar al cliente. Pasa con locations
    // sin verificar o sin Voice of Merchant.
    if (!location.newReviewUri) {
      Exceptions.badRequest(Errors.LOCATION_NOT_REVIEWABLE);
    }

    const slug = slugify(payload.slug ?? payload.name);

    // Si del nombre no sale un slug utilizable hay que pedir uno explicito, no reportar
    // un conflicto de unicidad que no existe.
    if (slug.length < 2) {
      Exceptions.badRequest(Errors.SLUG_NOT_DERIVABLE);
    }

    if (await this.campaignsRepository.findBySlug(business.urn, slug)) {
      Exceptions.conflict(Errors.CAMPAIGN_SLUG_ALREADY_EXISTS);
    }

    try {
      const campaign = await this.campaignsRepository.createOrUpdate({
        urn: Urn.createUUID(CAMPAIGN_ENTITY),
        businessUrn: business.urn,
        locationUrn: location.urn,
        name: payload.name.trim(),
        slug,
        status: CampaignStatus.ACTIVE,
        stats: { scans: 0, googleClicks: 0 },
        createdByUserUrn: user.urn,
      });

      return this.toPublic(business, campaign);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        Exceptions.conflict(Errors.CAMPAIGN_SLUG_ALREADY_EXISTS);
      }

      throw error;
    }
  }

  async findAll(business: Business): Promise<PublicCampaign[]> {
    const campaigns = await this.campaignsRepository.findAllForBusiness(business.urn);

    return campaigns.map((campaign) => this.toPublic(business, campaign));
  }

  async findOne(business: Business, urn: string): Promise<PublicCampaign> {
    return this.toPublic(business, await this.getOwned(business.urn, urn));
  }

  /**
   * Genera el QR de la campaña. La imagen se renderiza a demanda: lo unico que hay que
   * persistir es la URL que codifica.
   */
  async generateQr(business: Business, user: AuthenticatedUser, campaignUrn: string): Promise<GeneratedQr> {
    const campaign = await this.getOwned(business.urn, campaignUrn);
    const targetUrl = this.targetUrlFor(business, campaign);

    const existing = await this.qrCodesRepository.findByCampaign(business.urn, campaign.urn);
    await this.qrCodesRepository.createOrUpdate({
      urn: existing?.urn ?? Urn.createUUID(QR_CODE_ENTITY),
      businessUrn: business.urn,
      campaignUrn: campaign.urn,
      targetUrl,
      createdByUserUrn: user.urn,
    });

    const pngDataUrl = await toDataURL(targetUrl, {
      errorCorrectionLevel: config.Qr.ErrorCorrectionLevel,
      width: config.Qr.Width,
      margin: config.Qr.Margin,
    });

    return { targetUrl, pngDataUrl };
  }

  private async getOwned(businessUrn: string, urn: string): Promise<Campaign> {
    if (!Urn.isValid(urn, CAMPAIGN_ENTITY)) {
      Exceptions.notFound(Errors.CAMPAIGN_NOT_FOUND);
    }

    const campaign = await this.campaignsRepository.findForBusiness(businessUrn, urn);
    if (!campaign) {
      Exceptions.notFound(Errors.CAMPAIGN_NOT_FOUND);
    }

    return campaign;
  }

  private targetUrlFor(business: Business, campaign: Campaign): string {
    return `${config.PublicAppBaseUrl}/r/${business.slug}/${campaign.slug}`;
  }

  private toPublic(business: Business, campaign: Campaign): PublicCampaign {
    return {
      urn: campaign.urn,
      name: campaign.name,
      slug: campaign.slug,
      locationUrn: campaign.locationUrn,
      status: campaign.status,
      // Campo por campo: las campañas viejas todavia tienen `feedbacks` guardado en la base.
      stats: { scans: campaign.stats.scans, googleClicks: campaign.stats.googleClicks },
      targetUrl: this.targetUrlFor(business, campaign),
      createdAt: campaign.createdAt,
    };
  }
}
