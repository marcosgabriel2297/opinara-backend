import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { GOOGLE_PUSH_ADAPTER, GoogleConfig, GooglePushAdapter } from '@shared/integrations/google/exports';
import { LocationsService } from '@packages/locations';

import config from '../config';
import { ReviewSyncQueue } from '../services/review-sync.queue';

const NOTIFICATIONS_THROTTLE = { default: { limit: config.Notifications.ThrottleLimit, ttl: 60_000 } };

/**
 * Avisos de Google (reseña nueva o editada), via una suscripcion push de Pub/Sub.
 *
 * Es publico porque lo llama Pub/Sub: lo autentica el token OIDC que firma Google. Responde 204
 * enseguida y sincroniza en segundo plano; cualquier respuesta 2xx confirma el mensaje, y uno que
 * no se confirma Pub/Sub lo reintenta. Por eso un mensaje que no se entiende tambien se confirma:
 * reintentarlo no lo va a arreglar, y el cron de respaldo cubre lo que se pierda.
 */
@Controller('google/notifications')
export class ReviewNotificationsController {
  private readonly logger = new Logger(ReviewNotificationsController.name);

  constructor(
    private readonly queue: ReviewSyncQueue,
    private readonly locationsService: LocationsService,
    @Inject(GOOGLE_PUSH_ADAPTER) private readonly push: GooglePushAdapter,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(NOTIFICATIONS_THROTTLE)
  async receive(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<void> {
    if (!GoogleConfig.Notifications.Enabled) {
      Exceptions.notFound(Errors.NOT_FOUND);
    }

    if (!(await this.push.verify(authorization))) {
      Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    const notification = this.push.parse(body);
    if (!notification) {
      this.logger.warn('Ignored a Google notification without a recognizable location');
      return;
    }

    const locations = await this.locationsService.findAllActiveByGoogleRef(
      notification.locationId,
      notification.accountName,
    );

    for (const location of locations) {
      this.queue.enqueue({ businessUrn: location.businessUrn, locationUrn: location.urn });
    }
  }
}
