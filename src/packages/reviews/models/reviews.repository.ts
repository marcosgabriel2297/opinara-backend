import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { Review } from './review.model';

export interface ReviewFilters {
  locationUrn?: string;
  rating?: number;
  hasReply?: boolean;
}

export interface ReviewsSummaryRow {
  total: number;
  unanswered: number;
  oldestUnansweredAt: Date | null;
  averageRating: number | null;
  stars1: number;
  stars2: number;
  stars3: number;
  stars4: number;
  stars5: number;
  last30Count: number;
  last30Average: number | null;
  previous30Count: number;
  previous30Average: number | null;
}

@Injectable()
export class ReviewsRepository extends DatabaseRepository<Review> {
  constructor(@InjectModel(Review.name) model: Model<Review>) {
    super(model);
  }

  /** Todas las consultas parten de `businessUrn`: regla de aislamiento del proyecto. */
  private scope(businessUrn: string, filters: ReviewFilters = {}): FilterQuery<Review> {
    const query: FilterQuery<Review> = { businessUrn, deletedAt: { $exists: false } };

    if (filters.locationUrn) {
      query.locationUrn = filters.locationUrn;
    }

    if (filters.rating !== undefined) {
      query.starRating = filters.rating;
    }

    if (filters.hasReply !== undefined) {
      query.reply = filters.hasReply ? { $exists: true, $ne: null } : { $exists: false };
    }

    return query;
  }

  /** `oldest`: por fecha de creación, la que más espera primero (la fila de respuesta). */
  findPage(
    businessUrn: string,
    filters: ReviewFilters,
    page: number,
    limit: number,
    order: 'newest' | 'oldest' = 'newest',
  ): Promise<Review[]> {
    const sort = order === 'oldest' ? { googleCreateTime: 'asc' as const } : { googleUpdateTime: 'desc' as const };
    return this.find(this.scope(businessUrn, filters), { page, limit, sort });
  }

  /**
   * Las cifras del negocio en una sola pasada: totales, sin responder, distribución de estrellas
   * y las dos ventanas de 30 días para comparar. El promedio excluye las reseñas sin calificación
   * (`starRating` 0): no son un cero.
   */
  async summary(businessUrn: string, now: Date = new Date()): Promise<ReviewsSummaryRow> {
    const day = 24 * 60 * 60 * 1000;
    const last30 = new Date(now.getTime() - 30 * day);
    const previous30 = new Date(now.getTime() - 60 * day);
    const rated = { $gt: ['$starRating', 0] };
    const unanswered = { $not: [{ $ifNull: ['$reply', false] }] };
    const inWindow = (from: Date, to: Date) => ({
      $and: [{ $gte: ['$googleCreateTime', from] }, { $lt: ['$googleCreateTime', to] }],
    });

    const [row] = await this.model
      .aggregate<ReviewsSummaryRow>([
        { $match: this.scope(businessUrn) },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unanswered: { $sum: { $cond: [unanswered, 1, 0] } },
            oldestUnansweredAt: { $min: { $cond: [unanswered, '$googleCreateTime', null] } },
            averageRating: { $avg: { $cond: [rated, '$starRating', null] } },
            stars1: { $sum: { $cond: [{ $eq: ['$starRating', 1] }, 1, 0] } },
            stars2: { $sum: { $cond: [{ $eq: ['$starRating', 2] }, 1, 0] } },
            stars3: { $sum: { $cond: [{ $eq: ['$starRating', 3] }, 1, 0] } },
            stars4: { $sum: { $cond: [{ $eq: ['$starRating', 4] }, 1, 0] } },
            stars5: { $sum: { $cond: [{ $eq: ['$starRating', 5] }, 1, 0] } },
            last30Count: { $sum: { $cond: [inWindow(last30, now), 1, 0] } },
            last30Average: {
              $avg: { $cond: [{ $and: [inWindow(last30, now), rated] }, '$starRating', null] },
            },
            previous30Count: { $sum: { $cond: [inWindow(previous30, last30), 1, 0] } },
            previous30Average: {
              $avg: { $cond: [{ $and: [inWindow(previous30, last30), rated] }, '$starRating', null] },
            },
          },
        },
      ])
      .exec();

    return (
      row ?? {
        total: 0,
        unanswered: 0,
        oldestUnansweredAt: null,
        averageRating: null,
        stars1: 0,
        stars2: 0,
        stars3: 0,
        stars4: 0,
        stars5: 0,
        last30Count: 0,
        last30Average: null,
        previous30Count: 0,
        previous30Average: null,
      }
    );
  }

  countForBusiness(businessUrn: string, filters: ReviewFilters = {}): Promise<number> {
    return this.count(this.scope(businessUrn, filters));
  }

  findForBusiness(businessUrn: string, urn: string): Promise<Review | null> {
    return this.findOne({ businessUrn, urn });
  }

  findByGoogleId(locationUrn: string, googleReviewId: string): Promise<Review | null> {
    return this.findOne({ locationUrn, googleReviewId });
  }

  /**
   * Upsert atomico por la identidad de Google, devolviendo el documento ANTERIOR
   * (`null` si es alta). Reemplaza al patron "busco y despues escribo", que con dos
   * sincronizaciones simultaneas hacia que ambas creyeran estar creando la misma reseña
   * y la segunda chocara contra el indice unico.
   */
  upsertByGoogleId(
    locationUrn: string,
    googleReviewId: string,
    urnIfNew: string,
    fields: Partial<Review>,
    unset: Record<string, ''>,
  ): Promise<Review | null> {
    return this.model
      .findOneAndUpdate(
        { locationUrn, googleReviewId },
        { $set: fields, $setOnInsert: { urn: urnIfNew }, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
        { upsert: true, returnDocument: 'before', runValidators: true, setDefaultsOnInsert: true },
      )
      .lean<Review | null>()
      .exec();
  }

  /**
   * Marca como borradas las reseñas de la location que Google ya no devuelve.
   * Solo tiene sentido tras una corrida completa: en una incremental no vemos el historial
   * entero y marcariamos como borrado todo lo viejo.
   */
  async markDeletedExcept(locationUrn: string, presentGoogleIds: string[], deletedAt: Date): Promise<number> {
    const result = await this.model
      .updateMany(
        { locationUrn, googleReviewId: { $nin: presentGoogleIds }, deletedAt: { $exists: false } },
        { $set: { deletedAt } },
      )
      .exec();

    return result.modifiedCount;
  }
}
