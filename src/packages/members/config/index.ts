import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  Invitation: {
    /** Cuanto dura una invitacion sin aceptar. */
    ExpiresInSeconds: toNumber(process.env.INVITATION_EXPIRES_IN_SECONDS, 7 * 86400),
  },
  Throttle: {
    /** Consultar y aceptar una invitacion: reciben un token, mismo cuidado que el login. */
    Limit: toNumber(process.env.INVITATION_THROTTLE_LIMIT, 20),
    Ttl: toNumber(process.env.INVITATION_THROTTLE_TTL, 60000),
  },
};
