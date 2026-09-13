import { GoogleTokens } from '../dtos';

/** Cuenta de Google Business Profile, ya mapeada al dominio. */
export interface GoogleAccount {
  /** Formato `accounts/{accountId}`. */
  name: string;
  displayName: string;
  type?: string;
  verificationState?: string;
}

/** Location de Google, ya mapeada al dominio. */
export interface GoogleLocation {
  /** Formato `locations/{locationId}`. */
  name: string;
  locationId: string;
  title: string;
  storeCode?: string;
  placeId?: string;
  mapsUri?: string;
  newReviewUri?: string;
  address?: string;
  hasVoiceOfMerchant: boolean;
}

/**
 * Puertos hacia Google. El dominio depende de estas interfaces, nunca de axios ni de
 * la libreria de OAuth: en los tests se reemplazan por implementaciones falsas.
 */
/** Respuesta del negocio a una reseña. */
export interface GoogleReviewReply {
  comment: string;
  updateTime?: Date;
}

export interface GoogleReview {
  reviewId: string;
  name: string;
  /** 1..5. Google usa un enum; 0 significa que no vino rating. */
  starRating: number;
  starRatingRaw: string;
  comment?: string;
  reviewer: {
    displayName?: string;
    profilePhotoUrl?: string;
    isAnonymous: boolean;
  };
  createTime: Date;
  updateTime: Date;
  reply?: GoogleReviewReply;
  reviewReplyUrl?: string;
}

export interface GoogleReviewPage {
  reviews: GoogleReview[];
  nextPageToken?: string;
  totalReviewCount?: number;
  averageRating?: number;
}

/** Coordenadas de una location en la API v4.9: necesita la cuenta ademas de la location. */
export interface GoogleLocationRef {
  accountName: string;
  locationId: string;
}

export interface ListReviewsOptions {
  pageSize?: number;
  pageToken?: string;
  /** Valores aceptados por Google: `updateTime desc`, `rating`, `rating desc`. */
  orderBy?: string;
}

export interface GoogleOAuthAdapter {
  buildAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleTokens>;
  refreshAccessToken(refreshToken: string): Promise<GoogleTokens>;
  revokeToken(token: string): Promise<void>;
  isConfigured(): boolean;
}

export interface GoogleAccountsAdapter {
  listAccounts(accessToken: string): Promise<GoogleAccount[]>;
}

export interface GoogleLocationsAdapter {
  listLocations(accessToken: string, accountName: string): Promise<GoogleLocation[]>;
}

export interface GoogleReviewsAdapter {
  listReviews(accessToken: string, ref: GoogleLocationRef, options?: ListReviewsOptions): Promise<GoogleReviewPage>;
  getReview(accessToken: string, ref: GoogleLocationRef, reviewId: string): Promise<GoogleReview>;
  /** `updateReply` de Google crea la respuesta si no existe: por eso es PUT, no POST. */
  updateReply(
    accessToken: string,
    ref: GoogleLocationRef,
    reviewId: string,
    comment: string,
  ): Promise<GoogleReviewReply>;
  deleteReply(accessToken: string, ref: GoogleLocationRef, reviewId: string): Promise<void>;
}

export const GOOGLE_OAUTH_ADAPTER = Symbol('GOOGLE_OAUTH_ADAPTER');
export const GOOGLE_ACCOUNTS_ADAPTER = Symbol('GOOGLE_ACCOUNTS_ADAPTER');
export const GOOGLE_LOCATIONS_ADAPTER = Symbol('GOOGLE_LOCATIONS_ADAPTER');
export const GOOGLE_REVIEWS_ADAPTER = Symbol('GOOGLE_REVIEWS_ADAPTER');
