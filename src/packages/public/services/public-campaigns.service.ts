import { Injectable } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { BusinessesRepository } from '@shared/models/business';
import { BusinessStatus } from '@shared/models/enums/business';
import { FeedbackSource } from '@shared/models/enums/campaign';
import { Campaign, CampaignsRepository } from '@packages/campaigns';
import { FeedbackService } from '@packages/feedback';
import { Location, LocationsRepository } from '@packages/locations';

import * as DTO from '../dtos';
import { SubmitFeedbackDto } from '@packages/feedback/dtos/submit-feedback.dto';

/** Lo unico que ve un cliente anonimo. Sin urns, sin datos internos del negocio. */
export interface PublicLanding {
  business: { name: string };
  location: { title: string };
  campaign: { name: string; slug: string };
  /** Link de Google para dejar la reseña. */
  googleReviewUrl: string;
}

interface ResolvedCampaign {
  campaign: Campaign;
  location: Location;
  businessName: string;
  googleReviewUrl: string;
}

@Injectable()
export class PublicCampaignsService {
  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly campaignsRepository: CampaignsRepository,
    private readonly locationsRepository: LocationsRepository,
    private readonly feedbackService: FeedbackService,
  ) {}

  /** Landing del QR. Cuenta el escaneo. */
  async getLanding(params: DTO.CampaignParams): Promise<PublicLanding> {
    const resolved = await this.resolve(params);
    await this.campaignsRepository.increment(resolved.campaign.urn, 'scans');

    return {
      business: { name: resolved.businessName },
      location: { title: resolved.location.title },
      campaign: { name: resolved.campaign.name, slug: resolved.campaign.slug },
      googleReviewUrl: resolved.googleReviewUrl,
    };
  }

  /**
   * Registra el feedback y devuelve el link a Google.
   *
   * El link se devuelve SIEMPRE, sin importar el rating. Mostrarlo solo a los clientes
   * contentos es review gating: Google prohibe desalentar reseñas negativas o solicitar
   * selectivamente las positivas, y puede restringir el perfil del negocio.
   */
  async submitFeedback(params: DTO.CampaignParams, payload: SubmitFeedbackDto): Promise<{ googleReviewUrl: string }> {
    const resolved = await this.resolve(params);

    await this.feedbackService.create({
      businessUrn: resolved.campaign.businessUrn,
      locationUrn: resolved.location.urn,
      campaignUrn: resolved.campaign.urn,
      rating: payload.rating,
      comment: payload.comment,
      source: FeedbackSource.QR,
    });

    await this.campaignsRepository.increment(resolved.campaign.urn, 'feedbacks');

    return { googleReviewUrl: resolved.googleReviewUrl };
  }

  /** Metrica: el cliente siguio el link hacia Google. */
  async registerGoogleClick(params: DTO.CampaignParams): Promise<void> {
    const resolved = await this.resolve(params);
    await this.campaignsRepository.increment(resolved.campaign.urn, 'googleClicks');
  }

  /**
   * Resuelve negocio, campaña y location desde los slugs publicos.
   * Cualquier problema responde el mismo 404: un endpoint anonimo no debe permitir
   * deducir si existe el negocio, si la campaña esta pausada o si falta el link de Google.
   */
  private async resolve(params: DTO.CampaignParams): Promise<ResolvedCampaign> {
    const business = await this.businessesRepository.findBySlug(params.businessSlug);
    if (!business || business.status !== BusinessStatus.ACTIVE) {
      Exceptions.notFound(Errors.CAMPAIGN_NOT_FOUND);
    }

    const campaign = await this.campaignsRepository.findActiveBySlug(business.urn, params.campaignSlug);
    if (!campaign) {
      Exceptions.notFound(Errors.CAMPAIGN_NOT_FOUND);
    }

    const location = await this.locationsRepository.findForBusiness(business.urn, campaign.locationUrn);
    if (!location || !location.isActive || !location.newReviewUri) {
      Exceptions.notFound(Errors.CAMPAIGN_NOT_FOUND);
    }

    return { campaign, location, businessName: business.name, googleReviewUrl: location.newReviewUri };
  }
}
