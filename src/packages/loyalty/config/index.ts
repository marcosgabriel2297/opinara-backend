import '@shared/environment';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** El frontend. Se lee aca (como en campañas) y no de `SharedConfig`, que puede haberse cargado antes. */
const publicAppBaseUrl = (process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const MINUTE_MS = 60 * 1000;

export default {
  Program: {
    DefaultStampsRequired: 5,
    MinStampsRequired: 2,
    MaxStampsRequired: 20,
    /** Tiempo minimo entre dos sellos del mismo cliente: evita el doble toque y el sello "de regalo". */
    DefaultStampCooldownMinutes: 10,
    MaxStampCooldownMinutes: 24 * 60,
  },
  /** Cuanto tiempo se puede deshacer la ultima accion de una tarjeta. */
  UndoWindowMs: toNumber(process.env.LOYALTY_UNDO_WINDOW_MINUTES, 15) * MINUTE_MS,
  /**
   * Version de las condiciones que acepta el cliente al darse de alta. Se guarda con el
   * consentimiento: si cambian los textos, se cambia esta fecha.
   */
  TermsVersion: '2026-11-06',
  Throttle: {
    /** Altas por IP: el wifi de un local puede tener varias seguidas, un bot muchas mas. */
    Register: {
      limit: toNumber(process.env.LOYALTY_REGISTER_THROTTLE_LIMIT, 20),
      ttl: toNumber(process.env.LOYALTY_REGISTER_THROTTLE_TTL, 60 * MINUTE_MS),
    },
    /** Reenvio del link por mail: manda un mail, asi que es el mas estricto. */
    Resend: {
      limit: toNumber(process.env.LOYALTY_RESEND_THROTTLE_LIMIT, 5),
      ttl: toNumber(process.env.LOYALTY_RESEND_THROTTLE_TTL, 60 * MINUTE_MS),
    },
    /** Lecturas de la pagina publica y de la tarjeta. */
    Read: {
      limit: toNumber(process.env.PUBLIC_THROTTLE_LIMIT, 60),
      ttl: toNumber(process.env.PUBLIC_THROTTLE_TTL, MINUTE_MS),
    },
  },
  /** Lo que se imprime en el QR de alta de cada sucursal. */
  SignupUrl: (businessSlug: string, programSlug: string) =>
    `${publicAppBaseUrl}/f/${encodeURIComponent(businessSlug)}/${encodeURIComponent(programSlug)}`,
  /** El token va despues de `#`: asi no llega a ningun servidor ni queda en logs de acceso. */
  CardUrl: (token: string) => `${publicAppBaseUrl}/card#token=${token}`,
  Qr: {
    /** Como las campañas: correccion media, se sigue leyendo con algo de suciedad o reflejo. */
    ErrorCorrectionLevel: 'M' as const,
    Width: 512,
    Margin: 2,
  },
  /**
   * Lo que codifica el QR de la tarjeta. Con prefijo, para que la caja reconozca que es una tarjeta y
   * no otro QR (por ejemplo, el de las reseñas). No es un link: escanearlo con la camara no abre nada.
   */
  CardQrContent: (memberCode: string) => `opinara-card:${memberCode}`,
  /** Header con el que el frontend manda el token de la tarjeta. */
  CardTokenHeader: 'x-loyalty-card-token',
};
