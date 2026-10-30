import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Review } from '@packages/reviews';

export interface AdminReviewFilters {
  businessUrn?: string;
  locationUrn?: string;
  rating?: number;
  hasReply?: boolean;
  from?: Date;
  to?: Date;
  search?: string;
}

export interface AdminReviewsSummary {
  total: number;
  unanswered: number;
  averageRating: number | null;
  stars: Record<1 | 2 | 3 | 4 | 5, number>;
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Las reseñas de TODOS los negocios. Es la unica excepcion a la regla de que cada consulta parte de
 * un `businessUrn` (ver `ReviewsRepository`): vive aca, en el paquete del admin, y solo la usan
 * endpoints protegidos con `@AdminAuth()`.
 */
@Injectable()
export class AdminReviewsRepository {
  constructor(@InjectModel(Review.name) private readonly model: Model<Review>) {}

  private query(filters: AdminReviewFilters): FilterQuery<Review> {
    const query: FilterQuery<Review> = { deletedAt: { $exists: false } };

    if (filters.businessUrn) query.businessUrn = filters.businessUrn;
    if (filters.locationUrn) query.locationUrn = filters.locationUrn;
    if (filters.rating !== undefined) query.starRating = filters.rating;
    if (filters.hasReply !== undefined) {
      query.reply = filters.hasReply ? { $exists: true, $ne: null } : { $exists: false };
    }
    if (filters.from || filters.to) {
      query.googleCreateTime = {
        ...(filters.from ? { $gte: filters.from } : {}),
        ...(filters.to ? { $lt: filters.to } : {}),
      };
    }
    if (filters.search) {
      const pattern = new RegExp(escapeRegex(filters.search.trim()), 'i');
      query.$or = [{ comment: pattern }, { 'reviewer.displayName': pattern }];
    }

    return query;
  }

  findPage(filters: AdminReviewFilters, page: number, limit: number, order: 'newest' | 'oldest'): Promise<Review[]> {
    const sort = order === 'oldest' ? { googleCreateTime: 1 as const } : { googleCreateTime: -1 as const };
    return this.model
      .find(this.query(filters))
      .sort(sort)
      .skip(page * limit)
      .limit(limit)
      .lean<Review[]>()
      .exec();
  }

  count(filters: AdminReviewFilters): Promise<number> {
    return this.model.countDocuments(this.query(filters)).exec();
  }

  /** El promedio excluye las reseñas sin calificacion (`starRating` 0): no son un cero. */
  async summary(filters: AdminReviewFilters): Promise<AdminReviewsSummary> {
    const [row] = await this.model
      .aggregate<{
        total: number;
        unanswered: number;
        averageRating: number | null;
        stars1: number;
        stars2: number;
        stars3: number;
        stars4: number;
        stars5: number;
      }>([
        { $match: this.query(filters) },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unanswered: { $sum: { $cond: [{ $not: [{ $ifNull: ['$reply', false] }] }, 1, 0] } },
            averageRating: { $avg: { $cond: [{ $gt: ['$starRating', 0] }, '$starRating', null] } },
            stars1: { $sum: { $cond: [{ $eq: ['$starRating', 1] }, 1, 0] } },
            stars2: { $sum: { $cond: [{ $eq: ['$starRating', 2] }, 1, 0] } },
            stars3: { $sum: { $cond: [{ $eq: ['$starRating', 3] }, 1, 0] } },
            stars4: { $sum: { $cond: [{ $eq: ['$starRating', 4] }, 1, 0] } },
            stars5: { $sum: { $cond: [{ $eq: ['$starRating', 5] }, 1, 0] } },
          },
        },
      ])
      .exec();

    return {
      total: row?.total ?? 0,
      unanswered: row?.unanswered ?? 0,
      averageRating: row?.averageRating ?? null,
      stars: {
        1: row?.stars1 ?? 0,
        2: row?.stars2 ?? 0,
        3: row?.stars3 ?? 0,
        4: row?.stars4 ?? 0,
        5: row?.stars5 ?? 0,
      },
    };
  }
}
