import '@shared/environment';

const toSeconds = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ONE_DAY = 86400;
const THIRTY_DAYS = 2592000;
const ONE_MINUTE_MS = 60000;

export default {
  Password: {
    /** Coste de bcrypt: balance entre seguridad y latencia del login. */
    SaltRounds: 12,
  },
  Token: {
    // En segundos: evita el parsing ambiguo de strings tipo '1d' y sirve tal cual para `expiresIn`.
    AccessExpiresIn: toSeconds(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS, ONE_DAY),
    RefreshExpiresIn: toSeconds(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS, THIRTY_DAYS),
  },
  Throttle: {
    // Limite propio, mas estricto que el global, para los endpoints que reciben credenciales.
    Limit: toSeconds(process.env.AUTH_THROTTLE_LIMIT, 10),
    Ttl: toSeconds(process.env.AUTH_THROTTLE_TTL, ONE_MINUTE_MS),
  },
};
