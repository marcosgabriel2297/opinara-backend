import { GoogleAccount, GoogleLocation, GoogleReview, GoogleReviewReply } from '../adapters';
import {
  GoogleAccountResponse,
  GoogleLocationResponse,
  GooglePostalAddress,
  GoogleReviewReplyResponse,
  GoogleReviewResponse,
  GoogleStarRating,
} from '../dtos';

const formatAddress = (address?: GooglePostalAddress): string | undefined => {
  if (!address) {
    return undefined;
  }

  const parts = [...(address.addressLines ?? []), address.locality, address.administrativeArea, address.postalCode];

  const formatted = parts.filter((part): part is string => Boolean(part && part.trim())).join(', ');

  return formatted.length > 0 ? formatted : undefined;
};

export const toGoogleAccount = (account: GoogleAccountResponse): GoogleAccount | null =>
  account.name
    ? {
        name: account.name,
        displayName: account.accountName ?? account.name,
        type: account.type,
        verificationState: account.verificationState,
      }
    : null;

export const toGoogleLocation = (location: GoogleLocationResponse): GoogleLocation | null => {
  if (!location.name) {
    return null;
  }

  return {
    name: location.name,
    // `locations/{locationId}`: el id suelto hace falta para armar las rutas de la API v4.
    locationId: location.name.split('/')[1] ?? location.name,
    title: location.title ?? location.name,
    storeCode: location.storeCode,
    placeId: location.metadata?.placeId,
    mapsUri: location.metadata?.mapsUri,
    newReviewUri: location.metadata?.newReviewUri,
    address: formatAddress(location.storefrontAddress),
    hasVoiceOfMerchant: location.metadata?.hasVoiceOfMerchant ?? false,
  };
};

/** Google expresa el rating como enum; el producto lo usa como numero. */
const STAR_RATINGS: Record<GoogleStarRating, number> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

const toDate = (value?: string): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const toGoogleReviewReply = (reply?: GoogleReviewReplyResponse): GoogleReviewReply | undefined =>
  reply?.comment ? { comment: reply.comment, updateTime: toDate(reply.updateTime) } : undefined;

export const toGoogleReview = (review: GoogleReviewResponse): GoogleReview | null => {
  if (!review.reviewId || !review.name) {
    return null;
  }

  const raw = review.starRating ?? 'STAR_RATING_UNSPECIFIED';
  const createTime = toDate(review.createTime);
  const updateTime = toDate(review.updateTime);

  return {
    reviewId: review.reviewId,
    name: review.name,
    starRating: STAR_RATINGS[raw] ?? 0,
    starRatingRaw: raw,
    comment: review.comment,
    reviewer: {
      // Google permite reseñas anonimas: en ese caso no manda nombre ni foto.
      displayName: review.reviewer?.isAnonymous ? undefined : review.reviewer?.displayName,
      profilePhotoUrl: review.reviewer?.isAnonymous ? undefined : review.reviewer?.profilePhotoUrl,
      isAnonymous: review.reviewer?.isAnonymous ?? false,
    },
    createTime: createTime ?? new Date(0),
    updateTime: updateTime ?? createTime ?? new Date(0),
    reply: toGoogleReviewReply(review.reviewReply),
    reviewReplyUrl: review.reviewReplyUrl,
  };
};
