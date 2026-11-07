import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import config from '../config';
import { GoogleNotificationSettingsService } from './google-notification-settings.service';

/** Una vez por dia: que todas las cuentas conectadas sigan avisando a nuestro topic. */
@Injectable()
export class GoogleNotificationsScheduler {
  private readonly logger = new Logger(GoogleNotificationsScheduler.name);
  private running = false;

  constructor(private readonly settings: GoogleNotificationSettingsService) {}

  @Cron(config.Notifications.ReconcileCron, { name: 'google-notifications-reconcile' })
  async reconcile(): Promise<void> {
    if (!this.settings.enabled || this.running) {
      return;
    }

    this.running = true;
    try {
      const summary = await this.settings.reconcileAll();
      this.logger.log(
        `Notifications reconcile: ${summary.accounts} account(s), ${summary.active} active, ` +
          `${summary.conflict} in conflict, ${summary.failed} failed`,
      );
    } catch (error) {
      this.logger.error(`Notifications reconcile failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }
}
