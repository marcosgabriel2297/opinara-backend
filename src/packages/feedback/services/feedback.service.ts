import { Injectable } from '@nestjs/common';

import { Paginated, paginate } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import { FeedbackSource } from '@shared/models/enums/campaign';

import * as DTO from '../dtos';
import { DEFAULT_PAGE_SIZE } from '../dtos';
import { FEEDBACK_ENTITY, Feedback, FeedbackRepository, PublicFeedback, toPublicFeedback } from '../models';

export interface NewFeedback {
  businessUrn: string;
  locationUrn: string;
  campaignUrn: string;
  rating: number;
  comment?: string;
  source: FeedbackSource;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly feedbackRepository: FeedbackRepository) {}

  create(feedback: NewFeedback): Promise<Feedback> {
    return this.feedbackRepository.createOrUpdate({
      urn: Urn.createUUID(FEEDBACK_ENTITY),
      ...feedback,
    });
  }

  async findAll(businessUrn: string, query: DTO.ListFeedbackQuery): Promise<Paginated<PublicFeedback>> {
    const page = query.page ?? 0;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const filters = { locationUrn: query.locationUrn, campaignUrn: query.campaignUrn, rating: query.rating };

    const [items, total] = await Promise.all([
      this.feedbackRepository.findPage(businessUrn, filters, page, limit),
      this.feedbackRepository.countForBusiness(businessUrn, filters),
    ]);

    return paginate(items.map(toPublicFeedback), page, limit, total);
  }
}
