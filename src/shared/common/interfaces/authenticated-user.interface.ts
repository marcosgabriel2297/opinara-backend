/**
 * Payload que el `AuthGuard` deja en `request.user` tras validar el access token.
 */
export interface AuthenticatedUser {
  urn: string;
  email: string;
  /** La sesion del token: la que se revoca al cerrar sesion. */
  sessionUrn: string;
}

export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  /** Token del administrador de la plataforma: solo sirve contra `/admin`. */
  ADMIN = 'admin',
}

export interface JwtPayload {
  sub: string;
  email: string;
  type: TokenType;
  /** URN de la `Session`. Un token sin `sid` (anterior a las sesiones) no se acepta. */
  sid?: string;
}
