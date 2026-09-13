import '@shared/environment';

export default {
  /**
   * Base publica que se imprime en el QR. Es la del frontend que muestra el formulario,
   * no la del backend: la URL final es `{base}/r/{businessSlug}/{campaignSlug}`.
   */
  PublicAppBaseUrl: (process.env.PUBLIC_APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  Qr: {
    /** Correccion de errores media: el QR sigue leyendose con el logo o algo de suciedad. */
    ErrorCorrectionLevel: 'M' as const,
    Width: 512,
    Margin: 2,
  },
};
