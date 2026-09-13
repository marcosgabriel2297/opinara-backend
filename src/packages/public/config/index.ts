import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  Throttle: {
    /** Endpoints sin autenticacion: limite propio, mas estricto que el global. */
    Limit: toNumber(process.env.PUBLIC_THROTTLE_LIMIT, 30),
    Ttl: toNumber(process.env.PUBLIC_THROTTLE_TTL, 60000),
  },
};
