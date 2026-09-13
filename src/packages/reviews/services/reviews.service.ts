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
  ) {}

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
