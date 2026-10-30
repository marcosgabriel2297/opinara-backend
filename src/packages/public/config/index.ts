import '@shared/environment';

import SharedConfig from '@shared/config';

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const publicAppBaseUrl = SharedConfig.App.PublicAppBaseUrl;

export default {
  Throttle: {
    /**
     * Escaneos por minuto por IP **y** campaña (ver `ThrottleKeyParams`). Pensado para un local
     * lleno que comparte el wifi, no como el limite de un endpoint autenticado.
     */
    Limit: toNumber(process.env.PUBLIC_THROTTLE_LIMIT, 60),
    Ttl: toNumber(process.env.PUBLIC_THROTTLE_TTL, 60000),
  },
  /**
   * Pagina del frontend a la que va el cliente cuando el QR no sirve (negocio inexistente,
   * campaña pausada, sucursal sin link). Una sola, para no revelar cual de los casos fue.
   */
  UnavailableUrl: `${publicAppBaseUrl}/r/no-disponible`,
  /** Pagina de "hay mucha gente escaneando": espera unos segundos y vuelve a intentar sola. */
  BusyUrl: (businessSlug: string, campaignSlug: string) =>
    `${publicAppBaseUrl}/r/${encodeURIComponent(businessSlug)}/${encodeURIComponent(campaignSlug)}/espera`,
};
