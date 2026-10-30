import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  Token: {
    /** Sin refresh: al vencer, el admin vuelve a iniciar sesion. */
    ExpiresIn: toNumber(process.env.ADMIN_TOKEN_EXPIRES_IN_SECONDS, 8 * 3600),
  },
  Throttle: {
    // Mismo cuidado que el login de usuarios: recibe credenciales.
    Limit: toNumber(process.env.AUTH_THROTTLE_LIMIT, 10),
    Ttl: toNumber(process.env.AUTH_THROTTLE_TTL, 60000),
  },
};
