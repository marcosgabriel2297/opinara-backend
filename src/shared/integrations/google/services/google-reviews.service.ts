import { Injectable } from '@nestjs/common';

import {
  GoogleLocationRef,
  GoogleReview,
  GoogleReviewPage,
  GoogleReviewReply,
  GoogleReviewsAdapter,
  ListReviewsOptions,
} from '../adapters';
import { GoogleReviewReplyResponse, GoogleReviewResponse, ListReviewsResponse } from '../dtos';
import { GoogleEndpoints, GoogleLimits } from '../endpoints';
import { GoogleApiError } from '../errors';
import { toGoogleReview, toGoogleReviewReply } from '../mappers';
import { GoogleHttpService } from './google-http.service';

/**
 * Google My Business API v4.9 — el unico lugar donde siguen viviendo las reviews.
 *
 *   GET    /v4/accounts/{a}/locations/{l}/reviews
 *   GET    /v4/accounts/{a}/locations/{l}/reviews/{r}
 *   PUT    /v4/accounts/{a}/locations/{l}/reviews/{r}/reply
 *   DELETE /v4/accounts/{a}/locations/{l}/reviews/{r}/reply
 *
 * `pageSize` tiene tope 50 y `orderBy` solo acepta rating, rating desc y updateTime desc.
 */
@Injectable()
export class GoogleReviewsService implements GoogleReviewsAdapter {
  constructor(private readonly http: GoogleHttpService) {}

  async listReviews(
    accessToken: string,
    ref: GoogleLocationRef,
    options: ListReviewsOptions = {},
  ): Promise<GoogleReviewPage> {
    const response = await this.http.get<ListReviewsResponse>(
      'reviews.list',
      `${this.locationPath(ref)}/reviews`,
      accessToken,
      {
        pageSize: Math.min(options.pageSize ?? GoogleLimits.ReviewsPageSize, GoogleLimits.ReviewsPageSize),
        pageToken: options.pageToken,
        orderBy: options.orderBy,
      },
    );

    return {
      reviews: (response.reviews ?? []).map(toGoogleReview).filter((review): review is GoogleReview => review !== null),
      nextPageToken: response.nextPageToken,
      totalReviewCount: response.totalReviewCount,
      averageRating: response.averageRating,
    };
  }

  async getReview(accessToken: string, ref: GoogleLocationRef, reviewId: string): Promise<GoogleReview> {
    const response = await this.http.get<GoogleReviewResponse>(
      'reviews.get',
      `${this.locationPath(ref)}/reviews/${encodeURIComponent(reviewId)}`,
      accessToken,
    );

    const review = toGoogleReview(response);
    if (!review) {
      throw new GoogleApiError(undefined, 'malformed_review', 'reviews.get');
    }

    return review;
  }

  async updateReply(
    accessToken: string,
    ref: GoogleLocationRef,
    reviewId: string,
    comment: string,
  ): Promise<GoogleReviewReply> {
    const response = await this.http.put<GoogleReviewReplyResponse>(
      'reviews.updateReply',
      `${this.locationPath(ref)}/reviews/${encodeURIComponent(reviewId)}/reply`,
      accessToken,
      { comment },
    );

    return toGoogleReviewReply(response) ?? { comment };
  }

  async deleteReply(accessToken: string, ref: GoogleLocationRef, reviewId: string): Promise<void> {
    await this.http.delete<unknown>(
      'reviews.deleteReply',
      `${this.locationPath(ref)}/reviews/${encodeURIComponent(reviewId)}/reply`,
      accessToken,
    );
  }

  /** v4 necesita la cuenta en la ruta; la API v1 identifica la location sin ella. */
  private locationPath(ref: GoogleLocationRef): string {
    return `${GoogleEndpoints.Legacy}/${ref.accountName}/locations/${encodeURIComponent(ref.locationId)}`;
  }
}
