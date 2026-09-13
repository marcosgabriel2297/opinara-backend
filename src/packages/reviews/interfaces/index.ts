export interface SyncResult {
  locationUrn: string;
  /** Reseñas nuevas en nuestra base. */
  imported: number;
  /** Reseñas que ya teniamos y cambiaron en Google. */
  updated: number;
  /** Reseñas revisadas que no cambiaron: caen dentro de la ventana de solapamiento. */
  unchanged: number;
  /** Reseñas que ya no estan en Google (solo se detectan en corridas completas). */
  deleted: number;
  pages: number;
  /** True si se recorrio todo el historial en vez de solo lo nuevo. */
  full: boolean;
  /**
   * True si la corrida se corto por el tope de paginas y quedaron reseñas sin traer.
   * Cuando pasa, el marcador NO avanza: avanzarlo dejaria esas reseñas fuera para siempre.
   */
  truncated: boolean;
  startedAt: Date;
  finishedAt: Date;
}

/** Resultado de una location que no se pudo sincronizar. */
export interface SyncFailure {
  locationUrn: string;
  errorCode: string;
}

/**
 * Respuesta de una sincronizacion que abarca varias locations.
 * Una location con problemas (permisos, location dada de baja en Google) no invalida
 * el trabajo de las demas: se informa aparte.
 */
export interface SyncReport {
  locations: number;
  succeeded: number;
  failed: number;
  results: SyncResult[];
  failures: SyncFailure[];
}

/** Resumen agregado que usa el cron para loguear una corrida completa. */
export interface SyncSummary {
  locations: number;
  imported: number;
  updated: number;
  unchanged: number;
  deleted: number;
  failed: number;
}
