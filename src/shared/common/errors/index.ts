export enum Errors {
  // Generales / errores del framework (validacion, ruta inexistente, rate limit)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  INVALID_URN = 'INVALID_URN',
  SLUG_NOT_DERIVABLE = 'SLUG_NOT_DERIVABLE',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Autenticacion
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  WRONG_CREDENTIALS = 'WRONG_CREDENTIALS',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
  USER_INACTIVE = 'USER_INACTIVE',

  // Businesses
  BUSINESS_NOT_FOUND = 'BUSINESS_NOT_FOUND',
  BUSINESS_SLUG_ALREADY_EXISTS = 'BUSINESS_SLUG_ALREADY_EXISTS',
  BUSINESS_FORBIDDEN = 'BUSINESS_FORBIDDEN',
  BUSINESS_SUSPENDED = 'BUSINESS_SUSPENDED',

  // Google
  GOOGLE_NOT_CONFIGURED = 'GOOGLE_NOT_CONFIGURED',
  GOOGLE_CONNECTION_NOT_FOUND = 'GOOGLE_CONNECTION_NOT_FOUND',
  GOOGLE_ALREADY_CONNECTED = 'GOOGLE_ALREADY_CONNECTED',
  GOOGLE_CONNECTION_REVOKED = 'GOOGLE_CONNECTION_REVOKED',
  GOOGLE_INVALID_OAUTH_STATE = 'GOOGLE_INVALID_OAUTH_STATE',
  GOOGLE_OAUTH_EXCHANGE_FAILED = 'GOOGLE_OAUTH_EXCHANGE_FAILED',
  GOOGLE_MISSING_REFRESH_TOKEN = 'GOOGLE_MISSING_REFRESH_TOKEN',
  GOOGLE_PERMISSION_DENIED = 'GOOGLE_PERMISSION_DENIED',
  GOOGLE_RESOURCE_NOT_FOUND = 'GOOGLE_RESOURCE_NOT_FOUND',
  GOOGLE_RATE_LIMITED = 'GOOGLE_RATE_LIMITED',
  GOOGLE_UNAVAILABLE = 'GOOGLE_UNAVAILABLE',

  // Locations / reviews
  LOCATION_NOT_FOUND = 'LOCATION_NOT_FOUND',
  LOCATION_ALREADY_IMPORTED = 'LOCATION_ALREADY_IMPORTED',
  REVIEW_NOT_FOUND = 'REVIEW_NOT_FOUND',
  REVIEW_REPLY_NOT_FOUND = 'REVIEW_REPLY_NOT_FOUND',

  // Campañas / feedback
  CAMPAIGN_NOT_FOUND = 'CAMPAIGN_NOT_FOUND',
  CAMPAIGN_SLUG_ALREADY_EXISTS = 'CAMPAIGN_SLUG_ALREADY_EXISTS',
  CAMPAIGN_INACTIVE = 'CAMPAIGN_INACTIVE',
  LOCATION_NOT_REVIEWABLE = 'LOCATION_NOT_REVIEWABLE',
}

export const ErrorMessages: Record<Errors, string> = {
  [Errors.INTERNAL_SERVER_ERROR]: 'Internal server error',
  [Errors.INVALID_URN]: 'The provided identifier is not valid',
  [Errors.SLUG_NOT_DERIVABLE]: 'Could not derive a slug from the name, send an explicit slug',
  [Errors.BAD_REQUEST]: 'The request is invalid',
  [Errors.UNAUTHORIZED]: 'Authentication is required',
  [Errors.FORBIDDEN]: 'You do not have access to this resource',
  [Errors.NOT_FOUND]: 'Resource not found',
  [Errors.CONFLICT]: 'The resource is in a conflicting state',
  [Errors.TOO_MANY_REQUESTS]: 'Too many requests, slow down',
  [Errors.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',

  [Errors.EMAIL_ALREADY_EXISTS]: 'The email is already registered',
  [Errors.USER_NOT_FOUND]: 'User not found',
  [Errors.WRONG_CREDENTIALS]: 'Invalid email or password',
  [Errors.INVALID_REFRESH_TOKEN]: 'The refresh token is invalid or expired',
  [Errors.USER_INACTIVE]: 'The user is not active',

  [Errors.BUSINESS_NOT_FOUND]: 'Business not found',
  [Errors.BUSINESS_SLUG_ALREADY_EXISTS]: 'The business slug is already taken',
  [Errors.BUSINESS_FORBIDDEN]: 'You do not have access to this business',
  [Errors.BUSINESS_SUSPENDED]: 'The business is suspended',

  [Errors.GOOGLE_NOT_CONFIGURED]: 'Google OAuth is not configured on this server',
  [Errors.GOOGLE_CONNECTION_NOT_FOUND]: 'The business has no Google Business Profile connection',
  [Errors.GOOGLE_ALREADY_CONNECTED]: 'The business already has an active Google connection',
  [Errors.GOOGLE_CONNECTION_REVOKED]: 'The Google connection was revoked, reconnect the account',
  [Errors.GOOGLE_INVALID_OAUTH_STATE]: 'The OAuth state is invalid, expired or already used',
  [Errors.GOOGLE_OAUTH_EXCHANGE_FAILED]: 'Could not complete the Google authorization, start the connection again',
  [Errors.GOOGLE_MISSING_REFRESH_TOKEN]: 'Google did not return a refresh token, reconnect the account',
  [Errors.GOOGLE_PERMISSION_DENIED]: 'Google denied access to the requested resource',
  [Errors.GOOGLE_RESOURCE_NOT_FOUND]: 'The resource does not exist in Google Business Profile',
  [Errors.GOOGLE_RATE_LIMITED]: 'Google rate limit reached, try again later',
  [Errors.GOOGLE_UNAVAILABLE]: 'Google Business Profile is unavailable',

  [Errors.LOCATION_NOT_FOUND]: 'Location not found',
  [Errors.LOCATION_ALREADY_IMPORTED]: 'The location is already imported',
  [Errors.REVIEW_NOT_FOUND]: 'Review not found',
  [Errors.REVIEW_REPLY_NOT_FOUND]: 'The review has no reply',

  [Errors.CAMPAIGN_NOT_FOUND]: 'Campaign not found',
  [Errors.CAMPAIGN_SLUG_ALREADY_EXISTS]: 'The campaign slug is already taken for this business',
  [Errors.CAMPAIGN_INACTIVE]: 'The campaign is not active',
  [Errors.LOCATION_NOT_REVIEWABLE]: 'The location has no Google review link available',
};
