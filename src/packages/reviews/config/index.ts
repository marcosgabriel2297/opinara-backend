import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MINUTE_MS = 60 * 1000;

export default {
  Sync: {
    /**
     * Solapamiento hacia atras del corte incremental. Google ordena por `updateTime` con
     * su propio reloj: sin este margen, una reseña que llega con unos segundos de desfase
     * respecto de la ultima corrida se perderia para siempre.
     */
    OverlapMs: toNumber(process.env.REVIEW_SYNC_OVERLAP_MINUTES, 5) * MINUTE_MS,
    /** Tope duro de paginas por location: 50 reseñas por pagina. */
    MaxPages: toNumber(process.env.REVIEW_SYNC_MAX_PAGES, 100),
    Enabled: process.env.REVIEW_SYNC_ENABLED !== 'false',
    /** Cada cuanto corre la sincronizacion incremental. */
    Cron: process.env.REVIEW_SYNC_CRON ?? '0 */15 * * * *',
    /** Reconciliacion completa: detecta reseñas borradas en Google. */
    FullCron: process.env.REVIEW_SYNC_FULL_CRON ?? '0 0 3 * * *',
  },
};
