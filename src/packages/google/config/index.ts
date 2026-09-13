import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  State: {
    /** Ventana para completar el consentimiento en Google. */
    TtlSeconds: toNumber(process.env.GOOGLE_OAUTH_STATE_TTL_SECONDS, 600),
    Bytes: 32,
  },
  Throttle: {
    /** El callback es publico: se limita aparte del resto. */
    Limit: toNumber(process.env.GOOGLE_CALLBACK_THROTTLE_LIMIT, 20),
    Ttl: toNumber(process.env.GOOGLE_CALLBACK_THROTTLE_TTL, 60000),
  },
};
