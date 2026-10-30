import { Inject, Injectable, Logger } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Paginated, paginate } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import {
  GOOGLE_REVIEWS_ADAPTER,
  GoogleApiError,
  GoogleLocationRef,
  GoogleReview,
  GoogleReviewsAdapter,
  throwAsDomainError,
} from '@shared/integrations/google/exports';
import { Location, LocationsService } from '@packages/locations';
import { GoogleTokenService } from '@packages/google';
import { isDuplicateKeyError } from '@shared/utils';

import * as DTO from '../dtos';
import { DEFAULT_PAGE_SIZE } from '../dtos';
import { PublicReview, REVIEW_ENTITY, Review, ReviewsRepository, toPublicReview } from '../models';
import { REPLY_SUGGESTER, ReplySuggester } from './reply-suggester';

export interface ReviewsSummary {
  total: number;
  unanswered: number;
  oldestUnansweredAt: Date | null;
  /** Promedio de las reseñas con calificación; `null` si no hay ninguna. */
  averageRating: number | null;
  ratingCounts: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** Reseñas creadas en los últimos 30 días y en los 30 anteriores, para comparar. */
  last30Days: { count: number; averageRating: number | null };
  previous30Days: { count: number; averageRating: number | null };
  /** Si el servidor puede sugerir respuestas. */
  replySuggestions: boolean;
}

const roundRating = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100);

/** Que paso con una reseña al sincronizarla. */
export type UpsertOutcome = 'imported' | 'updated' | 'unchanged';

const NOT_FOUND = 404;

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly locationsService: LocationsService,
    private readonly tokenService: GoogleTokenService,
    @Inject(GOOGLE_REVIEWS_ADAPTER) private readonly reviews: GoogleReviewsAdapter,
    @Inject(REPLY_SUGGESTER) private readonly suggester: ReplySuggester,
  ) {}

  /**
   * Todas las sucursales del negocio. Si viene una sucursal, se valida como en el listado
   * por sucursal: una ajena responde 404, no una lista vacía.
   */
  async findAllForBusiness(businessUrn: string, query: DTO.ListBusinessReviewsQuery): Promise<Paginated<PublicReview>> {
    if (query.locationUrn !== undefined) {
      await this.locationsService.getOwned(businessUrn, query.locationUrn);
    }

    const page = query.page ?? 0;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const filters = { locationUrn: query.locationUrn, rating: query.rating, hasReply: query.hasReply };

    const [reviews, total] = await Promise.all([
      this.reviewsRepository.findPage(businessUrn, filters, page, limit, query.order ?? 'newest'),
      this.reviewsRepository.countForBusiness(businessUrn, filters),
    ]);

    return paginate(reviews.map(toPublicReview), page, limit, total);
  }

  async summary(businessUrn: string): Promise<ReviewsSummary> {
    const row = await this.reviewsRepository.summary(businessUrn);

    return {
      total: row.total,
      unanswered: row.unanswered,
      oldestUnansweredAt: row.oldestUnansweredAt,
      averageRating: roundRating(row.averageRating),
      ratingCounts: { '1': row.stars1, '2': row.stars2, '3': row.stars3, '4': row.stars4, '5': row.stars5 },
      last30Days: { count: row.last30Count, averageRating: roundRating(row.last30Average) },
      previous30Days: { count: row.previous30Count, averageRating: roundRating(row.previous30Average) },
      replySuggestions: this.suggester.available,
    };
  }

  /**
   * Un borrador de respuesta para que la persona lo revise y lo publique. No publica nada ni
   * guarda el texto: lo que se publica es siempre lo que la persona manda después.
   */
  async suggestReply(
    business: { urn: string; name: string },
    locationUrn: string,
    reviewUrn: string,
  ): Promise<{ comment: string }> {
    if (!this.suggester.available) {
      Exceptions.unavailable(Errors.REPLY_SUGGESTIONS_UNAVAILABLE);
    }

    const { review, location } = await this.getOwned(business.urn, locationUrn, reviewUrn);
    const firstName = review.reviewer.isAnonymous ? undefined : review.reviewer.displayName?.split(/\s+/)[0];

    let comment: string | null;
    try {
      comment = await this.suggester.suggest({
        businessName: business.name,
        locationTitle: location.title,
        rating: review.starRating,
        reviewerFirstName: firstName,
        comment: review.comment,
      });
    } catch (error) {
      this.logger.error(`Fallo la sugerencia para ${review.urn}`, error);
      Exceptions.unavailable(Errors.REPLY_SUGGESTION_FAILED);
    }

    if (comment === null) {
      Exceptions.unavailable(Errors.REPLY_SUGGESTION_FAILED);
    }

    return { comment: comment.slice(0, DTO.MAX_REPLY_LENGTH) };
  }

  /**
   * Listado desde nuestra copia local, no desde Google: el dashboard no puede depender
   * de la latencia ni de la cuota de la API en cada carga de pantalla.
   */
  async findAll(
    businessUrn: string,
    locationUrn: string,
    query: DTO.ListReviewsQuery,
  ): Promise<Paginated<PublicReview>> {
    // Valida que la location sea de este business antes de tocar reviews.
    await this.locationsService.getOwned(businessUrn, locationUrn);

    const page = query.page ?? 0;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const filters = { locationUrn, rating: query.rating, hasReply: query.hasReply };

    const [reviews, total] = await Promise.all([
      this.reviewsRepository.findPage(businessUrn, filters, page, limit),
      this.reviewsRepository.countForBusiness(businessUrn, filters),
    ]);

    return paginate(reviews.map(toPublicReview), page, limit, total);
  }

  async findOne(businessUrn: string, locationUrn: string, reviewUrn: string): Promise<PublicReview> {
    const { review } = await this.getOwned(businessUrn, locationUrn, reviewUrn);

    return toPublicReview(review);
  }

  /**
   * Publica o edita la respuesta del negocio. En Google es `updateReply` (PUT) y crea la
   * respuesta si no existe, asi que este endpoint sirve para ambos casos.
   */
  async reply(
    businessUrn: string,
    locationUrn: string,
    reviewUrn: string,
    payload: DTO.ReplyReview,
  ): Promise<PublicReview> {
    const { review, location } = await this.getOwned(businessUrn, locationUrn, reviewUrn);
    const accessToken = await this.tokenService.getAccessToken(businessUrn);

    const reply = await this.call(() =>
      this.reviews.updateReply(accessToken, this.refFor(location), review.googleReviewId, payload.comment),
    );

    // Google es la fuente de verdad; la copia local se actualiza para que el dashboard
    // muestre la respuesta sin esperar a la proxima sincronizacion.
    const updated = await this.reviewsRepository.createOrUpdate({
      urn: review.urn,
      reply: { comment: reply.comment, updateTime: reply.updateTime ?? new Date() },
      syncedAt: new Date(),
    });

    return toPublicReview(updated);
  }

  async deleteReply(businessUrn: string, locationUrn: string, reviewUrn: string): Promise<void> {
    const { review, location } = await this.getOwned(businessUrn, locationUrn, reviewUrn);

    if (!review.reply) {
      Exceptions.notFound(Errors.REVIEW_REPLY_NOT_FOUND);
    }

    const accessToken = await this.tokenService.getAccessToken(businessUrn);

    try {
      await this.reviews.deleteReply(accessToken, this.refFor(location), review.googleReviewId);
    } catch (error) {
      // Si en Google ya no existe, nuestra copia estaba vieja: se limpia y listo.
      if (error instanceof GoogleApiError && error.statusCode === NOT_FOUND) {
        this.logger.warn(`Reply for review ${review.urn} was already gone in Google`);
      } else if (error instanceof GoogleApiError) {
        throwAsDomainError(error);
      } else {
        throw error;
      }
    }

    await this.reviewsRepository.updateOne(
      { businessUrn, urn: review.urn },
      { $unset: { reply: '' }, $set: { syncedAt: new Date() } },
    );
  }

  /**
   * Alta o actualizacion de una reseña traida de Google, de forma atomica e idempotente.
   * Devuelve que paso con ella para que la sincronizacion pueda contar sin volver a leer.
   */
  async upsertFromGoogle(location: Location, googleReview: GoogleReview): Promise<UpsertOutcome> {
    const fields: Partial<Review> = {
      businessUrn: location.businessUrn,
      locationUrn: location.urn,
      googleReviewId: googleReview.reviewId,
      googleReviewName: googleReview.name,
      starRating: googleReview.starRating,
      starRatingRaw: googleReview.starRatingRaw,
      comment: googleReview.comment,
      reviewer: googleReview.reviewer,
      googleCreateTime: googleReview.createTime,
      googleUpdateTime: googleReview.updateTime,
      reviewReplyUrl: googleReview.reviewReplyUrl,
      syncedAt: new Date(),
    };

    // Lo que Google ya no manda se borra de nuestra copia: una respuesta eliminada desde
    // el panel de Google, o una reseña que reaparece despues de haber sido marcada borrada.
    const unset: Record<string, ''> = { deletedAt: '' };

    if (googleReview.reply) {
      fields.reply = { comment: googleReview.reply.comment, updateTime: googleReview.reply.updateTime };
    } else {
      unset.reply = '';
    }

    const previous = await this.upsertWithRetry(location, googleReview, fields, unset);

    if (!previous) {
      return 'imported';
    }

    return previous.googleUpdateTime.getTime() === googleReview.updateTime.getTime() ? 'unchanged' : 'updated';
  }

  /**
   * Dos upserts simultaneos sobre la misma clave todavia pueden chocar contra el indice
   * unico: en ese caso el documento ya existe y basta reintentar una vez.
   */
  private async upsertWithRetry(
    location: Location,
    googleReview: GoogleReview,
    fields: Partial<Review>,
    unset: Record<string, ''>,
  ): Promise<Review | null> {
    try {
      return await this.reviewsRepository.upsertByGoogleId(
        location.urn,
        googleReview.reviewId,
        Urn.createUUID(REVIEW_ENTITY),
        fields,
        unset,
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      this.logger.warn(`Concurrent sync detected for review ${googleReview.reviewId}, retrying upsert`);

      return this.reviewsRepository.upsertByGoogleId(
        location.urn,
        googleReview.reviewId,
        Urn.createUUID(REVIEW_ENTITY),
        fields,
        unset,
      );
    }
  }

  /** Location y review tienen que pertenecer al business; si no, 404. */
  private async getOwned(
    businessUrn: string,
    locationUrn: string,
    reviewUrn: string,
  ): Promise<{ review: Review; location: Location }> {
    const location = await this.locationsService.getOwned(businessUrn, locationUrn);

    if (!Urn.isValid(reviewUrn, REVIEW_ENTITY)) {
      Exceptions.notFound(Errors.REVIEW_NOT_FOUND);
    }

    const review = await this.reviewsRepository.findForBusiness(businessUrn, reviewUrn);

    // Tambien se verifica la location: una review de otra sucursal del mismo business
    // no puede leerse ni responderse desde esta ruta.
    if (!review || review.locationUrn !== location.urn || review.deletedAt) {
      Exceptions.notFound(Errors.REVIEW_NOT_FOUND);
    }

    return { review, location };
  }

  private refFor(location: Location): GoogleLocationRef {
    return { accountName: location.googleAccountName, locationId: location.googleLocationId };
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GoogleApiError) {
        return throwAsDomainError(error);
      }

      throw error;
    }
  }
}
