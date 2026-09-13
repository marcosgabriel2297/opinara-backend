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
} from '../models';

export interface GeneratedQr {
  targetUrl: string;
  /** PNG en base64 listo para mostrar o descargar. */
  pngDataUrl: string;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly campaignsRepository: CampaignsRepository,
    private readonly qrCodesRepository: QRCodesRepository,
    private readonly locationsService: LocationsService,
  ) {}

  async create(business: Business, user: AuthenticatedUser, payload: DTO.CreateCampaign): Promise<PublicCampaign> {
    const location = await this.locationsService.getOwned(business.urn, payload.locationUrn);

    // Sin link de Google la campaña no tiene a donde mandar al cliente. Pasa con locations
    // sin verificar o sin Voice of Merchant.
    if (!location.newReviewUri) {
      Exceptions.badRequest(Errors.LOCATION_NOT_REVIEWABLE);
    }

    const slug = slugify(payload.slug ?? payload.name);
    if (slug.length < 2) {
      Exceptions.badRequest(Errors.CAMPAIGN_SLUG_ALREADY_EXISTS);
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
        stats: { scans: 0, feedbacks: 0, googleClicks: 0 },
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
      stats: campaign.stats,
      targetUrl: this.targetUrlFor(business, campaign),
      createdAt: campaign.createdAt,
    };
  }
}
