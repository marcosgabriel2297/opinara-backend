import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  OAuth: {
    ClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    ClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    /** Debe coincidir exactamente con la URI registrada en Google Cloud. */
    RedirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
    SuccessUrl: process.env.GOOGLE_OAUTH_SUCCESS_URL ?? '',
    ErrorUrl: process.env.GOOGLE_OAUTH_ERROR_URL ?? '',
  },
  Http: {
    TimeoutMs: toNumber(process.env.GOOGLE_HTTP_TIMEOUT_MS, 15000),
    /** Reintentos ante 429 y 5xx. Google pide backoff exponencial con jitter. */
    MaxRetries: toNumber(process.env.GOOGLE_HTTP_MAX_RETRIES, 3),
    BaseBackoffMs: toNumber(process.env.GOOGLE_HTTP_BACKOFF_MS, 300),
  },
  Token: {
    /** Margen para renovar el access token antes de que expire de verdad. */
    RefreshSkewSeconds: toNumber(process.env.GOOGLE_TOKEN_REFRESH_SKEW_SECONDS, 120),
  },
};
