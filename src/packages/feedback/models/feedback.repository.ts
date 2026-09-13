import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { Feedback } from './feedback.model';

export interface FeedbackFilters {
  locationUrn?: string;
  campaignUrn?: string;
  rating?: number;
}

@Injectable()
export class FeedbackRepository extends DatabaseRepository<Feedback> {
  constructor(@InjectModel(Feedback.name) model: Model<Feedback>) {
    super(model);
  }

  private scope(businessUrn: string, filters: FeedbackFilters = {}): FilterQuery<Feedback> {
    const query: FilterQuery<Feedback> = { businessUrn };

    if (filters.locationUrn) {
      query.locationUrn = filters.locationUrn;
    }

    if (filters.campaignUrn) {
      query.campaignUrn = filters.campaignUrn;
    }

    if (filters.rating !== undefined) {
      query.rating = filters.rating;
    }

    return query;
  }

  findPage(businessUrn: string, filters: FeedbackFilters, page: number, limit: number): Promise<Feedback[]> {
    return this.find(this.scope(businessUrn, filters), { page, limit, sort: { createdAt: 'desc' } });
  }

  countForBusiness(businessUrn: string, filters: FeedbackFilters = {}): Promise<number> {
    return this.count(this.scope(businessUrn, filters));
  }
}
