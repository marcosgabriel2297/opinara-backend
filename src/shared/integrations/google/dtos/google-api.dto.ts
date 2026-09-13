/**
 * Shape crudo de las respuestas de Google que consumimos. Solo los campos documentados
 * que el producto usa; el resto se ignora deliberadamente.
 */

export interface GoogleAccountResponse {
  name?: string;
  accountName?: string;
  type?: string;
  verificationState?: string;
  vettedState?: string;
}

export interface ListAccountsResponse {
  accounts?: GoogleAccountResponse[];
  nextPageToken?: string;
}

export interface GooglePostalAddress {
  regionCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  addressLines?: string[];
}

export interface GoogleLocationMetadata {
  placeId?: string;
  mapsUri?: string;
  /** Link de Google Search donde un cliente puede dejar una reseña. */
  newReviewUri?: string;
  hasVoiceOfMerchant?: boolean;
  duplicateLocation?: string;
}

export interface GoogleLocationResponse {
  /** Formato `locations/{locationId}`. */
  name?: string;
  title?: string;
  storeCode?: string;
  languageCode?: string;
  storefrontAddress?: GooglePostalAddress;
  metadata?: GoogleLocationMetadata;
}

export interface ListLocationsResponse {
  locations?: GoogleLocationResponse[];
  nextPageToken?: string;
  totalSize?: number;
}

/** Tokens devueltos por el intercambio OAuth, ya normalizados. */
export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
}

/** Enum de rating de la API v4.9. */
export type GoogleStarRating = 'STAR_RATING_UNSPECIFIED' | 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';

export interface GoogleReviewerResponse {
  displayName?: string;
  profilePhotoUrl?: string;
  isAnonymous?: boolean;
}

export interface GoogleReviewReplyResponse {
  comment?: string;
  updateTime?: string;
}

export interface GoogleReviewResponse {
  /** `accounts/{a}/locations/{l}/reviews/{r}` */
  name?: string;
  reviewId?: string;
  reviewer?: GoogleReviewerResponse;
  starRating?: GoogleStarRating;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: GoogleReviewReplyResponse;
  /** Agregado por Google en abril de 2026; puede no venir. */
  reviewReplyUrl?: string;
}

export interface ListReviewsResponse {
  reviews?: GoogleReviewResponse[];
  nextPageToken?: string;
  averageRating?: number;
  totalReviewCount?: number;
}
