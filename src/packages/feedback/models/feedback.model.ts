import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { FeedbackSource } from '@shared/models/enums/campaign';
import { Entity } from '@shared/repositories';

export const FEEDBACK_ENTITY = 'feedback';

/**
 * Feedback interno de la plataforma. Es una entidad separada de `Review` a proposito:
 * `Review` es un espejo de Google y `Feedback` es dato propio del negocio. No se mezclan.
 *
 * No se guarda PII del cliente: ni IP, ni user agent, ni contacto. Para limitar abuso
 * alcanza con el rate limit del endpoint publico.
 */
@Schema({ collection: 'feedback', timestamps: true })
export class Feedback implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, index: true })
  locationUrn!: string;

  @Prop({ required: true, index: true })
  campaignUrn!: string;

  /** 1 a 5. */
  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ required: false, trim: true })
  comment?: string;

  @Prop({ required: true, enum: FeedbackSource, default: FeedbackSource.QR })
  source!: FeedbackSource;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type FeedbackDocument = HydratedDocument<Feedback>;
export const FeedbackSchema = SchemaFactory.createForClass(Feedback);

FeedbackSchema.index({ businessUrn: 1, createdAt: -1 });

export interface PublicFeedback {
  urn: string;
  locationUrn: string;
  campaignUrn: string;
  rating: number;
  comment?: string;
  source: FeedbackSource;
  createdAt?: Date;
}

export const toPublicFeedback = (feedback: Feedback): PublicFeedback => ({
  urn: feedback.urn,
  locationUrn: feedback.locationUrn,
  campaignUrn: feedback.campaignUrn,
  rating: feedback.rating,
  comment: feedback.comment,
  source: feedback.source,
  createdAt: feedback.createdAt,
});
