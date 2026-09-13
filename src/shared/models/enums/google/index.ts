export enum GoogleConnectionStatus {
  ACTIVE = 'ACTIVE',
  /** El usuario revoco el acceso en Google o el refresh token dejo de servir. */
  REVOKED = 'REVOKED',
  /** Lo desconecto el negocio desde nuestro dashboard. */
  DISCONNECTED = 'DISCONNECTED',
}
