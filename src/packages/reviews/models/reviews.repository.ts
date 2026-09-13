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

  findPage(businessUrn: string, filters: ReviewFilters, page: number, limit: number): Promise<Review[]> {
    return this.find(this.scope(businessUrn, filters), { page, limit, sort: { googleUpdateTime: 'desc' } });
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
