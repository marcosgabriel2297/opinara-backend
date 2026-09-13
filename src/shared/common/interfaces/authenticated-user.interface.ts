/**
 * Payload que el `AuthGuard` deja en `request.user` tras validar el access token.
 */
export interface AuthenticatedUser {
  urn: string;
  email: string;
}

export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
}

export interface JwtPayload {
  sub: string;
  email: string;
  type: TokenType;
}
