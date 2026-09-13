import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import config from '../config';
import { ReviewSyncService } from './review-sync.service';

/**
 * Disparador periodico de la sincronizacion.
 *
 * El servicio de sync no sabe que existe este cron: manaña el disparador puede ser un worker
 * de BullMQ o el webhook de Pub/Sub sin tocar la logica.
 */
@Injectable()
export class ReviewSyncScheduler {
  private readonly logger = new Logger(ReviewSyncScheduler.name);

  /**
   * Candado en memoria para que dos corridas no se pisen si una tarda mas que el intervalo.
   * Sirve para una sola instancia; con varias replicas hace falta un lock distribuido,
   * que llega junto con la cola de trabajos.
   */
  private running = false;

  constructor(private readonly syncService: ReviewSyncService) {}

  @Cron(config.Sync.Cron, { name: 'reviews-incremental-sync' })
  async incremental(): Promise<void> {
    await this.run(false);
  }

  @Cron(config.Sync.FullCron, { name: 'reviews-full-sync' })
  async full(): Promise<void> {
    await this.run(true);
  }

  private async run(full: boolean): Promise<void> {
    if (!config.Sync.Enabled) {
      return;
    }

    if (this.running) {
      this.logger.warn('Previous review sync is still running, skipping this tick');
      return;
    }

    this.running = true;
    const startedAt = Date.now();

    try {
      const summary = await this.syncService.syncAllLocations({ full });
      this.logger.log(
        `Scheduled ${full ? 'full' : 'incremental'} sync: ${summary.locations} location(s), ` +
          `${summary.imported} new, ${summary.updated} updated, ${summary.failed} failed ` +
          `in ${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      // Un cron nunca debe tirar: se loguea y se espera al proximo tick.
      this.logger.error(`Scheduled review sync failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.running = false;
    }
  }
}
