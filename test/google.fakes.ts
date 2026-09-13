import {
  GoogleAccount,
  GoogleAccountsAdapter,
  GoogleApiError,
  GoogleLocation,
  GoogleLocationRef,
  GoogleLocationsAdapter,
  GoogleOAuthAdapter,
  GoogleReview,
  GoogleReviewPage,
  GoogleReviewReply,
  GoogleReviewsAdapter,
  GoogleTokens,
  ListReviewsOptions,
} from '../src/shared/integrations/google/exports';

const HOUR_MS = 3600 * 1000;

export const FAKE_REFRESH_TOKEN = '1//0fake-refresh-token';
export const FAKE_ACCESS_TOKEN = 'ya29.fake-access-token';

/** Doble del OAuth de Google: codigos y errores se controlan desde cada test. */
export class FakeGoogleOAuthAdapter implements GoogleOAuthAdapter {
  configured = true;
  refreshCalls = 0;
  revokedTokens: string[] = [];
  refreshError?: GoogleApiError;
  exchangeError?: GoogleApiError;
  omitRefreshToken = false;
  lastState?: string;

  isConfigured(): boolean {
    return this.configured;
  }

  buildAuthorizationUrl(state: string): string {
    this.lastState = state;
    const params = new URLSearchParams({
      client_id: 'fake-client-id',
      redirect_uri: 'http://localhost/api/auth/google/callback',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/business.manage',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleTokens> {
    if (this.exchangeError) {
      throw this.exchangeError;
    }

    if (code === 'codigo-invalido') {
      throw new GoogleApiError(400, 'invalid_grant', 'oauth.exchangeCode');
    }

    return {
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: this.omitRefreshToken ? undefined : FAKE_REFRESH_TOKEN,
      expiresAt: new Date(Date.now() + HOUR_MS),
      scopes: ['https://www.googleapis.com/auth/business.manage'],
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    this.refreshCalls += 1;

    if (this.refreshError) {
      throw this.refreshError;
    }

    return {
      accessToken: `${FAKE_ACCESS_TOKEN}-renovado-${this.refreshCalls}`,
      refreshToken,
      expiresAt: new Date(Date.now() + HOUR_MS),
      scopes: ['https://www.googleapis.com/auth/business.manage'],
    };
  }

  async revokeToken(token: string): Promise<void> {
    this.revokedTokens.push(token);
  }
}

export class FakeGoogleAccountsAdapter implements GoogleAccountsAdapter {
  accounts: GoogleAccount[] = [
    { name: 'accounts/111', displayName: 'Cuenta Principal', type: 'LOCATION_GROUP' },
    { name: 'accounts/222', displayName: 'Cuenta Secundaria', type: 'PERSONAL' },
  ];
  error?: GoogleApiError;
  lastAccessToken?: string;

  async listAccounts(accessToken: string): Promise<GoogleAccount[]> {
    this.lastAccessToken = accessToken;

    if (this.error) {
      throw this.error;
    }

    return this.accounts;
  }
}

export class FakeGoogleLocationsAdapter implements GoogleLocationsAdapter {
  locations: GoogleLocation[] = [
    {
      name: 'locations/555',
      locationId: '555',
      title: 'Sucursal Centro',
      storeCode: 'CENTRO',
      placeId: 'ChIJfake555',
      mapsUri: 'https://maps.google.com/?cid=555',
      newReviewUri: 'https://search.google.com/local/writereview?placeid=ChIJfake555',
      address: 'Av. Siempreviva 742, Springfield',
      hasVoiceOfMerchant: true,
    },
    {
      name: 'locations/666',
      locationId: '666',
      title: 'Sucursal Norte',
      hasVoiceOfMerchant: false,
    },
  ];
  error?: GoogleApiError;
  calls = 0;

  async listLocations(_accessToken: string, accountName: string): Promise<GoogleLocation[]> {
    this.calls += 1;

    if (this.error) {
      throw this.error;
    }

    return accountName === 'accounts/111' ? this.locations : [];
  }
}

/** Doble de la API v4.9 de reviews. */
export class FakeGoogleReviewsAdapter implements GoogleReviewsAdapter {
  reviews: GoogleReview[] = [];
  replies = new Map<string, GoogleReviewReply>();
  deletedReplies: string[] = [];
  error?: GoogleApiError;
  deleteError?: GoogleApiError;
  /** Falla solo para esta location: sirve para probar fallos parciales. */
  failLocationId?: string;
  lastRef?: GoogleLocationRef;
  lastOptions?: ListReviewsOptions;

  listCalls = 0;

  /** Pagina como Google: `updateTime` descendente y `nextPageToken` mientras queden reseñas. */
  async listReviews(
    _accessToken: string,
    ref: GoogleLocationRef,
    options: ListReviewsOptions = {},
  ): Promise<GoogleReviewPage> {
    this.lastRef = ref;
    this.lastOptions = options;
    this.listCalls += 1;

    if (this.failLocationId && ref.locationId === this.failLocationId) {
      throw new GoogleApiError(403, 'PERMISSION_DENIED', 'reviews.list');
    }

    if (this.error) {
      throw this.error;
    }

    const ordered = [...this.reviews].sort((a, b) => b.updateTime.getTime() - a.updateTime.getTime());
    const offset = options.pageToken ? Number(options.pageToken) : 0;
    const pageSize = options.pageSize ?? 50;
    const slice = ordered.slice(offset, offset + pageSize);
    const next = offset + pageSize;

    return {
      reviews: slice,
      nextPageToken: next < ordered.length ? String(next) : undefined,
      totalReviewCount: ordered.length,
      averageRating: 4.5,
    };
  }

  async getReview(_accessToken: string, ref: GoogleLocationRef, reviewId: string): Promise<GoogleReview> {
    this.lastRef = ref;

    if (this.error) {
      throw this.error;
    }

    const review = this.reviews.find((candidate) => candidate.reviewId === reviewId);
    if (!review) {
      throw new GoogleApiError(404, 'NOT_FOUND', 'reviews.get');
    }

    return review;
  }

  async updateReply(
    _accessToken: string,
    ref: GoogleLocationRef,
    reviewId: string,
    comment: string,
  ): Promise<GoogleReviewReply> {
    this.lastRef = ref;

    if (this.error) {
      throw this.error;
    }

    const reply = { comment, updateTime: new Date('2026-09-13T12:00:00.000Z') };
    this.replies.set(reviewId, reply);

    return reply;
  }

  async deleteReply(_accessToken: string, ref: GoogleLocationRef, reviewId: string): Promise<void> {
    this.lastRef = ref;

    if (this.deleteError) {
      throw this.deleteError;
    }

    this.replies.delete(reviewId);
    this.deletedReplies.push(reviewId);
  }
}

export const buildGoogleReview = (overrides: Partial<GoogleReview> = {}): GoogleReview => ({
  reviewId: 'review-1',
  name: 'accounts/111/locations/555/reviews/review-1',
  starRating: 5,
  starRatingRaw: 'FIVE',
  comment: 'Excelente atencion',
  reviewer: { displayName: 'Ana Perez', profilePhotoUrl: 'https://lh3.google.com/ana', isAnonymous: false },
  createTime: new Date('2026-09-01T10:00:00.000Z'),
  updateTime: new Date('2026-09-01T10:00:00.000Z'),
  ...overrides,
});
