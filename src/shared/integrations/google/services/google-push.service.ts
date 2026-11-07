import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

import { GooglePushAdapter, GoogleReviewNotification } from '../adapters';
import config from '../config';
import { PubSubPushBody } from '../dtos';

/** `accounts/{a}/locations/{l}` (API v4) o `locations/{l}` (API v1), con o sin la reseña al final. */
const LOCATION_PATTERN = /(?:^|\/)(?:(accounts\/[^/]+)\/)?locations\/([^/]+)/;

/**
 * Avisos de Google Business Profile que llegan por una suscripcion push de Pub/Sub.
 *
 * Origen: la suscripcion manda un token OIDC firmado por Google en `Authorization`. Se valida
 * la firma y la audiencia con la libreria oficial, y que lo emita la cuenta de servicio que
 * configuramos en la suscripcion: sin eso cualquiera podria disparar sincronizaciones.
 *
 * Formato: Google documenta que los avisos de reseñas traen `location_name` y `review_name`,
 * pero no publica un ejemplo del JSON. Por eso no se depende del nombre exacto de los campos:
 * se busca el nombre de recurso de la sucursal entre los valores del mensaje, primero en los
 * campos que hablan de `location`.
 */
@Injectable()
export class GooglePushService implements GooglePushAdapter {
  private readonly logger = new Logger(GooglePushService.name);
  private readonly client = new OAuth2Client();

  async verify(authorizationHeader: string | undefined): Promise<boolean> {
    const { Audience, PushServiceAccount } = config.Notifications;
    const idToken = /^Bearer (.+)$/.exec(authorizationHeader ?? '')?.[1];

    if (!idToken || !Audience || !PushServiceAccount) {
      return false;
    }

    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: Audience });
      const payload = ticket.getPayload();

      return payload?.email === PushServiceAccount && payload.email_verified === true;
    } catch (error) {
      // Nunca se loguea el token: solo que no paso la verificacion.
      this.logger.warn(`Rejected Pub/Sub push: ${error instanceof Error ? error.message : 'invalid token'}`);
      return false;
    }
  }

  parse(body: unknown): GoogleReviewNotification | null {
    const data = (body as PubSubPushBody | undefined)?.message?.data;
    if (typeof data !== 'string') {
      return null;
    }

    let message: unknown;
    try {
      message = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    } catch {
      return null;
    }

    if (typeof message !== 'object' || message === null) {
      return null;
    }

    const entries = Object.entries(message as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    );
    // Primero los campos de la sucursal; despues el resto (el nombre de la reseña tambien la contiene).
    entries.sort(([a], [b]) => Number(/location/i.test(b)) - Number(/location/i.test(a)));

    for (const [, value] of entries) {
      const match = LOCATION_PATTERN.exec(value);
      if (match) {
        return { accountName: match[1], locationId: match[2] };
      }
    }

    return null;
  }
}
