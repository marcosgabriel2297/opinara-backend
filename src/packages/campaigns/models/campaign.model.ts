import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { CampaignStatus } from '@shared/models/enums/campaign';
import { Entity } from '@shared/repositories';

export const CAMPAIGN_ENTITY = 'campaign';

@Schema({ _id: false })
export class CampaignStats {
  /** Aperturas de la landing publica. */
  @Prop({ required: true, default: 0 })
  scans!: number;

  @Prop({ required: true, default: 0 })
  feedbacks!: number;

  /** Clientes que siguieron el link hacia Google. */
  @Prop({ required: true, default: 0 })
  googleClicks!: number;
}

const CampaignStatsSchema = SchemaFactory.createForClass(CampaignStats);

/**
 * Campaña: la unidad que se imprime en un QR. Apunta a una location concreta porque el
 * link a Google es por sucursal.
 */
@Schema({ collection: 'campaigns', timestamps: true })
export class Campaign implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, index: true })
  locationUrn!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Segunda parte de la URL publica: `/r/{businessSlug}/{campaignSlug}`. */
  @Prop({ required: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, enum: CampaignStatus, default: CampaignStatus.ACTIVE })
  status!: CampaignStatus;

  @Prop({ type: CampaignStatsSchema, required: true, default: () => ({ scans: 0, feedbacks: 0, googleClicks: 0 }) })
  stats!: CampaignStats;

  @Prop({ required: true })
  createdByUserUrn!: string;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type CampaignDocument = HydratedDocument<Campaign>;
export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// El slug es unico dentro del negocio, no globalmente: dos negocios pueden tener "mostrador".
CampaignSchema.index({ businessUrn: 1, slug: 1 }, { unique: true });

export interface PublicCampaign {
  urn: string;
  name: string;
  slug: string;
  locationUrn: string;
  status: CampaignStatus;
  stats: CampaignStats;
  /** URL que se imprime en el QR. */
  targetUrl: string;
  createdAt?: Date;
}
