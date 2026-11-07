import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  GOOGLE_NOTIFICATIONS_ADAPTER,
  GoogleConfig,
  GoogleNotificationsAdapter,
  REVIEW_NOTIFICATION_TYPES,
} from '@shared/integrations/google/exports';
import { GoogleNotificationsStatus } from '@shared/models/enums/google';
import { LocationsService } from '@packages/locations';

import { GoogleConnectionsRepository } from '../models';
import { GoogleTokenService } from './google-token.service';

export interface NotificationsReconcileSummary {
  accounts: number;
  active: number;
  conflict: number;
  failed: number;
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : 'unknown error');

/**
 * Registra el topic de Pub/Sub de Opinara en cada cuenta de Google de los negocios, para que
 * Google avise cuando entra o cambia una reseña.
 *
 * Todo es best-effort: si registrar falla, el cron de sincronizacion sigue trayendo las reseñas
 * y la reconciliacion diaria vuelve a intentarlo. Por eso ningun metodo tira.
 *
 * Google admite **un solo topic por cuenta**. Si la cuenta ya avisa a otro (otra herramienta del
 * negocio), no se pisa: queda en `CONFLICT` y ese negocio se sincroniza solo por el cron.
 */
@Injectable()
export class GoogleNotificationSettingsService {
  private readonly logger = new Logger(GoogleNotificationSettingsService.name);

  constructor(
    private readonly connectionsRepository: GoogleConnectionsRepository,
    private readonly locationsService: LocationsService,
    private readonly tokenService: GoogleTokenService,
    @Inject(GOOGLE_NOTIFICATIONS_ADAPTER) private readonly notifications: GoogleNotificationsAdapter,
  ) {}

  get enabled(): boolean {
    return GoogleConfig.Notifications.Enabled && Boolean(GoogleConfig.Notifications.Topic);
  }

  /** Deja la cuenta avisando a nuestro topic. Devuelve el estado, o `null` con los avisos apagados. */
  async ensureForAccount(
    businessUrn: string,
    accountName: string,
    accessToken?: string,
  ): Promise<GoogleNotificationsStatus | null> {
    if (!this.enabled) {
      return null;
    }

    const topic = GoogleConfig.Notifications.Topic;
    let status: GoogleNotificationsStatus;

    try {
      const token = accessToken ?? (await this.tokenService.getAccessToken(businessUrn));
      const current = await this.notifications.getNotificationSetting(token, accountName);

      if (current.pubsubTopic && current.pubsubTopic !== topic) {
        status = GoogleNotificationsStatus.CONFLICT;
        this.logger.warn(`Google account ${accountName} of ${businessUrn} already sends notifications elsewhere`);
      } else {
        // Si el topic ya es nuestro se conservan los tipos que tenga: solo se suman los de reseñas.
        const types = new Set(current.pubsubTopic === topic ? current.notificationTypes : []);
        const missing = REVIEW_NOTIFICATION_TYPES.some((type) => !types.has(type));

        if (current.pubsubTopic !== topic || missing) {
          REVIEW_NOTIFICATION_TYPES.forEach((type) => types.add(type));
          await this.notifications.updateNotificationSetting(token, accountName, {
            pubsubTopic: topic,
            notificationTypes: [...types],
          });
          this.logger.log(`Google notifications registered for ${accountName} (${businessUrn})`);
        }

        status = GoogleNotificationsStatus.ACTIVE;
      }
    } catch (error) {
      status = GoogleNotificationsStatus.ERROR;
      this.logger.warn(`Could not register Google notifications for ${accountName}: ${describe(error)}`);
    }

    try {
      await this.connectionsRepository.setNotificationStatus(businessUrn, accountName, status);
    } catch (error) {
      this.logger.warn(`Could not store notifications status for ${businessUrn}: ${describe(error)}`);
    }

    return status;
  }

  /**
   * Al desconectar: las cuentas del negocio dejan de avisarnos. Solo se toca lo que es nuestro
   * (otro topic no se borra) y no se corta una cuenta que otro negocio de Opinara sigue usando.
   * Tiene que correr antes de revocar el token.
   */
  async disableForBusiness(businessUrn: string, accessToken: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    for (const accountName of await this.locationsService.findGoogleAccountNames(businessUrn)) {
      try {
        if (await this.locationsService.isGoogleAccountUsedElsewhere(accountName, businessUrn)) {
          continue;
        }

        const current = await this.notifications.getNotificationSetting(accessToken, accountName);
        if (current.pubsubTopic === GoogleConfig.Notifications.Topic) {
          await this.notifications.updateNotificationSetting(accessToken, accountName, {
            pubsubTopic: '',
            notificationTypes: [],
          });
        }
      } catch (error) {
        this.logger.warn(`Could not disable Google notifications for ${accountName}: ${describe(error)}`);
      }
    }
  }

  /**
   * Revisa todas las cuentas de los negocios conectados. Registra las que se importaron con los
   * avisos apagados, reintenta las que fallaron y detecta si otra herramienta pisó nuestro topic.
   */
  async reconcileAll(): Promise<NotificationsReconcileSummary> {
    const summary: NotificationsReconcileSummary = { accounts: 0, active: 0, conflict: 0, failed: 0 };
    if (!this.enabled) {
      return summary;
    }

    for (const connection of await this.connectionsRepository.findAllActive()) {
      const accounts = await this.locationsService.findGoogleAccountNames(connection.businessUrn);
      if (accounts.length === 0) {
        continue;
      }

      let token: string;
      try {
        token = await this.tokenService.getAccessToken(connection.businessUrn);
      } catch (error) {
        summary.accounts += accounts.length;
        summary.failed += accounts.length;
        this.logger.warn(`Skipping notifications of ${connection.businessUrn}: ${describe(error)}`);
        continue;
      }

      for (const accountName of accounts) {
        summary.accounts += 1;
        const status = await this.ensureForAccount(connection.businessUrn, accountName, token);
        if (status === GoogleNotificationsStatus.ACTIVE) summary.active += 1;
        else if (status === GoogleNotificationsStatus.CONFLICT) summary.conflict += 1;
        else summary.failed += 1;
      }
    }

    return summary;
  }
}
