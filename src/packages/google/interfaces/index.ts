export interface AuthorizationRequest {
  authorizationUrl: string;
  expiresAt: Date;
}

export interface CallbackResult {
  businessUrn: string;
}
