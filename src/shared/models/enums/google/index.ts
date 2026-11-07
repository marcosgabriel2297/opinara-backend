export enum GoogleConnectionStatus {
  ACTIVE = 'ACTIVE',
  /** El usuario revoco el acceso en Google o el refresh token dejo de servir. */
  REVOKED = 'REVOKED',
  /** Lo desconecto el negocio desde nuestro dashboard. */
  DISCONNECTED = 'DISCONNECTED',
}

/** Estado de los avisos en tiempo real de una cuenta de Google. */
export enum GoogleNotificationsStatus {
  /** La cuenta manda los avisos de reseñas a nuestro topic. */
  ACTIVE = 'ACTIVE',
  /** La cuenta ya manda sus avisos a otro topic (otra herramienta): no se pisa. */
  CONFLICT = 'CONFLICT',
  /** No se pudo registrar (permisos, cuota, Google caido). Se reintenta en la reconciliacion. */
  ERROR = 'ERROR',
}
