import { Injectable, Logger } from '@nestjs/common';

import { LocationsService } from '@packages/locations';

import { ReviewSyncService } from './review-sync.service';

interface QueuedLocation {
  businessUrn: string;
  locationUrn: string;
}

/**
 * Cola en memoria de sucursales a sincronizar por un aviso de Google.
 *
 * - **Agrupa**: diez avisos de la misma sucursal mientras espera son una sola sincronizacion. Si
 *   llega un aviso mientras esa sucursal se esta sincronizando, se vuelve a encolar una vez mas,
 *   para no perder la reseña que entro durante la corrida.
 * - **De a una**: la cuota de Google (300 por minuto) es del proyecto y la comparten todos los
 *   negocios, igual que en el cron.
 * - Si se cae el proceso se pierde lo encolado: no importa, el cron de respaldo lo levanta.
 */
@Injectable()
export class ReviewSyncQueue {
  private readonly logger = new Logger(ReviewSyncQueue.name);
  private readonly pending = new Map<string, QueuedLocation>();
  private draining?: Promise<void>;

  constructor(
    private readonly syncService: ReviewSyncService,
    private readonly locationsService: LocationsService,
  ) {}

  enqueue(item: QueuedLocation): void {
    this.pending.set(item.locationUrn, item);

    if (!this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = undefined;
      });
    }
  }

  /** Resuelve cuando no queda nada por sincronizar. Lo usan los tests. */
  async idle(): Promise<void> {
    while (this.draining) {
      await this.draining;
    }
  }

  private async drain(): Promise<void> {
    for (let next = this.shift(); next; next = this.shift()) {
      try {
        // Se relee la sucursal: pudo desactivarse, y su `lastReviewSyncAt` define el corte incremental.
        const location = await this.locationsService.getOwned(next.businessUrn, next.locationUrn);
        if (location.isActive) {
          await this.syncService.syncLocation(location);
        }
      } catch (error) {
        this.logger.warn(
          `Notified sync failed for ${next.locationUrn}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  private shift(): QueuedLocation | undefined {
    const first = this.pending.values().next();
    if (first.done) {
      return undefined;
    }

    this.pending.delete(first.value.locationUrn);
    return first.value;
  }
}
