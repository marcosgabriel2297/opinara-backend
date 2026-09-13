import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Entity } from '@shared/repositories';

export const REVIEW_ENTITY = 'review';

@Schema({ _id: false })
export class ReviewAuthor {
  @Prop({ required: false, trim: true })
  displayName?: string;

  @Prop({ required: false })
  profilePhotoUrl?: string;

  @Prop({ required: true, default: false })
  isAnonymous!: boolean;
}

const ReviewAuthorSchema = SchemaFactory.createForClass(ReviewAuthor);

@Schema({ _id: false })
export class ReviewReply {
  @Prop({ required: true })
  comment!: string;

  @Prop({ required: false })
  updateTime?: Date;
}

const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply);

/**
 * Copia local de una reseña real de Google.
 *
 * Es un espejo de lectura: la fuente de verdad es Google. Nunca creamos reseñas -no existe
 * endpoint para eso y la politica de Google lo prohibe-, solo las sincronizamos y respondemos.
 * El feedback propio de la plataforma es otra entidad y no se mezcla con esta.
 */
@Schema({ collection: 'reviews', timestamps: true })
export class Review implements Entity {
  @Prop({ required: true, unique: true, index: true })
  urn!: string;

  @Prop({ required: true, index: true })
  businessUrn!: string;

  @Prop({ required: true, index: true })
  locationUrn!: string;

  @Prop({ required: true })
  googleReviewId!: string;

  /** Nombre de recurso completo: `accounts/{a}/locations/{l}/reviews/{r}`. */
  @Prop({ required: true })
  googleReviewName!: string;

  /** 1..5; 0 si Google no informo rating. */
  @Prop({ required: true })
  starRating!: number;

  /** Valor original del enum de Google, por si cambia el mapeo. */
  @Prop({ required: true })
  starRatingRaw!: string;

  @Prop({ required: false })
  comment?: string;

  @Prop({ type: ReviewAuthorSchema, required: true })
  reviewer!: ReviewAuthor;

  @Prop({ required: true })
  googleCreateTime!: Date;

  @Prop({ required: true })
  googleUpdateTime!: Date;

  @Prop({ type: ReviewReplySchema, required: false })
  reply?: ReviewReply;

  @Prop({ required: false })
  reviewReplyUrl?: string;

  @Prop({ required: false })
  googleReviewUrl?: string;

  @Prop({ required: true })
  syncedAt!: Date;

  /** La reseña desaparecio de Google (la borro su autor o Google la modero). */
  @Prop({ required: false })
  deletedAt?: Date;

  declare createdAt?: Date;
  declare updatedAt?: Date;
}

export type ReviewDocument = HydratedDocument<Review>;
export const ReviewSchema = SchemaFactory.createForClass(Review);

// Una reseña de Google existe una sola vez por location.
ReviewSchema.index({ locationUrn: 1, googleReviewId: 1 }, { unique: true });
// Orden por defecto del dashboard y corte de la sincronizacion incremental.
ReviewSchema.index({ businessUrn: 1, googleUpdateTime: -1 });

export interface PublicReview {
  urn: string;
  locationUrn: string;
  rating: number;
  comment?: string;
  reviewer: { displayName?: string; profilePhotoUrl?: string; isAnonymous: boolean };
  createdAt: Date;
  updatedAt: Date;
  reply?: { comment: string; updatedAt?: Date };
  googleReviewUrl?: string;
  syncedAt: Date;
}

export const toPublicReview = (review: Review): PublicReview => ({
  urn: review.urn,
  locationUrn: review.locationUrn,
  rating: review.starRating,
  comment: review.comment,
  reviewer: {
    displayName: review.reviewer.displayName,
    profilePhotoUrl: review.reviewer.profilePhotoUrl,
    isAnonymous: review.reviewer.isAnonymous,
  },
  // Fechas de Google, no las nuestras: son las que le importan al negocio.
  createdAt: review.googleCreateTime,
  updatedAt: review.googleUpdateTime,
  reply: review.reply ? { comment: review.reply.comment, updatedAt: review.reply.updateTime } : undefined,
  googleReviewUrl: review.googleReviewUrl,
  syncedAt: review.syncedAt,
});
