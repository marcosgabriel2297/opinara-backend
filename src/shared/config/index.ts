import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
};

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export default {
  App: {
    Port: toNumber(process.env.PORT, 3000),
    Prefix: 'api',
    PublicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    CorsOrigins: toList(process.env.CORS_ORIGINS),
  },
  Mongo: {
    Uri: process.env.DATABASE_URI ?? '',
    Database: process.env.DATABASE_NAME ?? 'opinara',
    Connection: 'opinaraConnection',
  },
  Jwt: {
    Secret: process.env.JWT_SECRET_KEY ?? '',
    AccessExpiresInSeconds: toNumber(process.env.JWT_ACCESS_EXPIRES_IN_SECONDS, 86400),
    RefreshSecret: process.env.JWT_REFRESH_SECRET_KEY ?? process.env.JWT_SECRET_KEY ?? '',
    RefreshExpiresInSeconds: toNumber(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS, 2592000),
  },
  Crypto: {
    /** Clave AES-256-GCM en base64 (32 bytes) usada para cifrar tokens de Google en reposo. */
    TokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
    TokenEncryptionKeyVersion: toNumber(process.env.TOKEN_ENCRYPTION_KEY_VERSION, 1),
  },
  Throttle: {
    Ttl: toNumber(process.env.THROTTLE_TTL, 60000),
    Limit: toNumber(process.env.THROTTLE_LIMIT, 120),
  },
};
