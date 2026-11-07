import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  /** Las semanas de los reportes de toda la plataforma: los negocios son todos de Argentina. */
  Timezone: 'America/Argentina/Buenos_Aires',
  Google: {
    /** La sincronización corre cada 15 minutos: una sucursal sin sincronizar hace más que esto está atrasada. */
    StaleAfterHours: toNumber(process.env.ADMIN_GOOGLE_STALE_AFTER_HOURS, 6),
  },
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
