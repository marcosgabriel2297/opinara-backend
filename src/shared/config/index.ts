import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== undefined && value !== '' ? parsed : fallback;
};

/**
 * `TRUST_PROXY` tal cual lo entiende Express: `true`/`false`, un numero de saltos o una lista de
 * IPs/subredes. Sin configurar, no se confia en ningun proxy (la IP es la del socket).
 */
const toTrustProxy = (value: string | undefined): boolean | number | string | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
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
    CorsOrigins: toList(process.env.CORS_ORIGINS),
    /** Detras de un proxy inverso, para que la IP del rate limit sea la del cliente y no la del proxy. */
    TrustProxy: toTrustProxy(process.env.TRUST_PROXY),
    /** El frontend: a donde apuntan los QR y los links de los mails. */
    PublicAppBaseUrl: (process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
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
  Mail: {
    /** Sin clave, los mails van al log (ver `LogMailer`). */
    ResendApiKey: process.env.MAIL_RESEND_API_KEY || undefined,
    From: process.env.MAIL_FROM ?? 'Opinara <no-responder@opinara.app>',
  },
  Throttle: {
    Ttl: toNumber(process.env.THROTTLE_TTL, 60000),
    Limit: toNumber(process.env.THROTTLE_LIMIT, 120),
  },
};
