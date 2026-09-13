import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';
import { BusinessStatus } from '../enums/business';

export const BUSINESS_ENTITY = 'business';

/**
 * Unidad de tenancy: todo dato del producto (locations, reviews, campañas, feedback)
 * cuelga de un business. El vinculo con los usuarios vive en `BusinessMember`.
 */
@Schema({ collection: 'businesses', timestamps: true })
export class Business implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Parte publica de la URL del QR: `/r/{businessSlug}/{campaignSlug}`. */
  @Prop({ required: true, unique: true, index: true, lowercase: true, trim: true })
  slug!: string;

  @Prop({ required: true, index: true })
  ownerUserUrn!: string;

  @Prop({ required: true, enum: BusinessStatus, default: BusinessStatus.ACTIVE })
  status!: BusinessStatus;

  @Prop({ required: false, trim: true })
  timezone?: string;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type BusinessDocument = HydratedDocument<Business>;
export const BusinessSchema = SchemaFactory.createForClass(Business);

export interface PublicBusiness {
  urn: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  timezone?: string;
  createdAt?: Date;
}

export const toPublicBusiness = (business: Business): PublicBusiness => ({
  urn: business.urn,
  name: business.name,
  slug: business.slug,
  status: business.status,
  timezone: business.timezone,
  createdAt: business.createdAt,
});
