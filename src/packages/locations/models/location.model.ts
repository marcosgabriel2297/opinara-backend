import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const LOCATION_ENTITY = 'location';

/**
 * Location de Google importada por un business.
 *
 * Se guardan los dos identificadores de Google porque las APIs no coinciden: la API v1 de
 * Business Information identifica la location como `locations/{id}`, pero la API v4 de reviews
 * necesita la ruta completa `accounts/{accountId}/locations/{locationId}`.
 */
@Schema({ collection: 'locations', timestamps: true })
export class Location implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  /** `accounts/{accountId}` */
  @Prop({ required: true })
  googleAccountName!: string;

  /** `locations/{locationId}` */
  @Prop({ required: true })
  googleLocationName!: string;

  @Prop({ required: true })
  googleLocationId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: false, trim: true })
  storeCode?: string;

  @Prop({ required: false })
  placeId?: string;

  @Prop({ required: false })
  mapsUri?: string;

  /** Link de Google para dejar una reseña. Sin esto la location no sirve para campañas. */
  @Prop({ required: false })
  newReviewUri?: string;

  @Prop({ required: false })
  address?: string;

  @Prop({ required: true, default: false })
  hasVoiceOfMerchant!: boolean;

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: false })
  lastReviewSyncAt?: Date;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type LocationDocument = HydratedDocument<Location>;
export const LocationSchema = SchemaFactory.createForClass(Location);

// Una misma location de Google no se importa dos veces en el mismo business.
LocationSchema.index({ businessUrn: 1, googleLocationName: 1 }, { unique: true });

export interface PublicLocation {
  urn: string;
  title: string;
  storeCode?: string;
  address?: string;
  placeId?: string;
  mapsUri?: string;
  googleReviewUrl?: string;
  hasVoiceOfMerchant: boolean;
  isActive: boolean;
  lastReviewSyncAt?: Date;
  createdAt?: Date;
}

export const toPublicLocation = (location: Location): PublicLocation => ({
  urn: location.urn,
  title: location.title,
  storeCode: location.storeCode,
  address: location.address,
  placeId: location.placeId,
  mapsUri: location.mapsUri,
  googleReviewUrl: location.newReviewUri,
  hasVoiceOfMerchant: location.hasVoiceOfMerchant,
  isActive: location.isActive,
  lastReviewSyncAt: location.lastReviewSyncAt,
  createdAt: location.createdAt,
});
