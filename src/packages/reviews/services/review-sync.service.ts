import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import {
  GOOGLE_REVIEWS_ADAPTER,
  GoogleApiError,
  GoogleLimits,
  GoogleLocationRef,
  GoogleReviewsAdapter,
  throwAsDomainError,
} from '@shared/integrations/google/exports';
import { GoogleTokenService } from '@packages/google';
import { Location, LocationsService } from '@packages/locations';

import config from '../config';
import { SyncFailure, SyncReport, SyncResult, SyncSummary } from '../interfaces';
import { ReviewsRepository } from '../models';
import { ReviewsService } from './reviews.service';

/** Google ordena por `updateTime` descendente: la primera pagina trae lo mas reciente. */
const ORDER_BY = 'updateTime desc';

/**
 * Sincronizacion de reseñas: unico punto de entrada, usado por el endpoint manual, por el
 * cron y -en el futuro- por el webhook de Pub/Sub.
 *
 * Es idempotente y no guarda estado en memoria entre corridas, asi que moverla a un worker
 * (BullMQ) mas adelante es cambiar quien la invoca, no reescribirla.
 */
@Injectable()
export class ReviewSyncService {
  private readonly logger = new Logger(ReviewSyncService.name);

  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly locationsService: LocationsService,
    private readonly tokenService: GoogleTokenService,
    @Inject(GOOGLE_REVIEWS_ADAPTER) private readonly reviews: GoogleReviewsAdapter,
  ) {}

  /**
   * Recorre todas las locations activas del sistema. Es lo que llama el cron.
   * Una location que falla no corta la corrida: se cuenta y se sigue con la siguiente,
   * porque un negocio con la conexion revocada no puede frenar la sincronizacion del resto.
   */
  async syncAllLocations(options: { full?: boolean } = {}): Promise<SyncSummary> {
    const locations = await this.locationsService.findAllActive();
    const summary: SyncSummary = { locations: 0, imported: 0, updated: 0, unchanged: 0, deleted: 0, failed: 0 };
    const tokens = new Map<string, string>();

    for (const location of locations) {
      try {
        const token =
          tokens.get(location.businessUrn) ?? (await this.tokenService.getAccessToken(location.businessUrn));
        tokens.set(location.businessUrn, token);

        const result = await this.syncLocation(location, token, options);
        summary.locations += 1;
        summary.imported += result.imported;
        summary.updated += result.updated;
        summary.unchanged += result.unchanged;
        summary.deleted += result.deleted;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn(
          `Sync failed for location ${location.urn}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return summary;
  }

  /**
   * Sincroniza todas las locations activas de un business.
   *
   * Si una location falla se informa aparte y se sigue con el resto: un negocio con cinco
   * sucursales y un problema de permisos en una no puede quedarse sin sincronizar nunca.
   * Los problemas que afectan a todo el negocio (sin conexion, conexion revocada) si cortan,
   * porque ocurren antes del recorrido.
   */
  async syncBusiness(businessUrn: string, options: { full?: boolean } = {}): Promise<SyncReport> {
    const locations = await this.locationsService.findActiveForBusiness(businessUrn);
    if (locations.length === 0) {
      Exceptions.notFound(Errors.LOCATION_NOT_FOUND);
    }

    // Un solo access token para todas las locations del negocio.
    const accessToken = await this.tokenService.getAccessToken(businessUrn);

    const results: SyncResult[] = [];
    const failures: SyncFailure[] = [];
    let firstError: unknown;

    // Secuencial a proposito: la cuota de Google (300 QPM) es por proyecto y la comparten
    // todos los tenants, asi que no conviene paralelizar sin una cola que la administre.
    for (const location of locations) {
      try {
        results.push(await this.syncLocation(location, accessToken, options));
      } catch (error) {
        firstError = firstError ?? error;
        failures.push({ locationUrn: location.urn, errorCode: this.errorCodeOf(error) });
        this.logger.warn(`Sync failed for location ${location.urn}: ${this.errorCodeOf(error)}`);
      }
    }

    // Si no se sincronizo ninguna, el pedido fallo: devolver 200 con todo en error haria
    // que un cliente que solo mira el status code creyera que salio bien.
    if (results.length === 0 && firstError) {
      throw firstError;
    }

    return { locations: locations.length, succeeded: results.length, failed: failures.length, results, failures };
  }

  /** Codigo estable del error, sin exponer el detalle del proveedor. */
  private errorCodeOf(error: unknown): string {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const parsed = typeof body === 'object' && body !== null ? (body as { error?: string }) : {};
      return parsed.error ?? Errors.INTERNAL_SERVER_ERROR;
    }

    return Errors.INTERNAL_SERVER_ERROR;
  }

  /**
   * Sincroniza una location. Incremental por defecto: recorre paginas hasta encontrar
   * reseñas anteriores al ultimo corte. La primera corrida es completa.
   */
  async syncLocation(location: Location, accessToken?: string, options: { full?: boolean } = {}): Promise<SyncResult> {
    const startedAt = new Date();
    const token = accessToken ?? (await this.tokenService.getAccessToken(location.businessUrn));
    const cursor = this.cursorFor(location, options.full);
    const full = cursor === undefined;

    let imported = 0;
    let updated = 0;
    let unchanged = 0;
    let pages = 0;
    let truncated = false;
    let pageToken: string | undefined;
    const seenGoogleIds: string[] = [];

    do {
      const page = await this.call(() =>
        this.reviews.listReviews(token, this.refFor(location), {
          pageSize: GoogleLimits.ReviewsPageSize,
          pageToken,
          orderBy: ORDER_BY,
        }),
      );
      pages += 1;

      for (const review of page.reviews) {
        // Con orden descendente, la primera reseña vieja significa que ya vimos todo lo nuevo.
        if (cursor && review.updateTime <= cursor) {
          pageToken = undefined;
          return this.finish(location, startedAt, {
            imported,
            updated,
            unchanged,
            deleted: 0,
            pages,
            full,
            truncated: false,
          });
        }

        seenGoogleIds.push(review.reviewId);

        const outcome = await this.reviewsService.upsertFromGoogle(location, review);
        if (outcome === 'imported') {
          imported += 1;
        } else if (outcome === 'updated') {
          updated += 1;
        } else {
          unchanged += 1;
        }
      }

      pageToken = page.nextPageToken;

      if (pages >= config.Sync.MaxPages && pageToken) {
        // Quedaron reseñas sin traer. No se avanza el marcador ni se concluye nada sobre
        // borrados: con datos incompletos, ambas cosas destruirian informacion real.
        truncated = true;
        this.logger.error(
          `Sync of ${location.urn} hit the ${config.Sync.MaxPages} page cap with reviews left to fetch. ` +
            'The sync marker was not advanced; raise REVIEW_SYNC_MAX_PAGES.',
        );
        pageToken = undefined;
      }
    } while (pageToken);

    // Solo una corrida completa y sin cortar vio todo el historial: es la unica que puede
    // concluir que lo que falta fue borrado en Google.
    const deleted =
      full && !truncated ? await this.reviewsRepository.markDeletedExcept(location.urn, seenGoogleIds, new Date()) : 0;

    return this.finish(location, startedAt, { imported, updated, unchanged, deleted, pages, full, truncated });
  }

  /**
   * Corte incremental con solapamiento hacia atras. `undefined` significa corrida completa:
   * primera sincronizacion de la location o reconciliacion pedida explicitamente.
   */
  private cursorFor(location: Location, full?: boolean): Date | undefined {
    if (full || !location.lastReviewSyncAt) {
      return undefined;
    }

    return new Date(location.lastReviewSyncAt.getTime() - config.Sync.OverlapMs);
  }

  /**
   * El marcador avanza al inicio de la corrida, no al final: si una reseña cambio mientras
   * sincronizabamos, la proxima corrida la vuelve a ver.
   */
  private async finish(
    location: Location,
    startedAt: Date,
    counters: Omit<SyncResult, 'locationUrn' | 'startedAt' | 'finishedAt'>,
  ): Promise<SyncResult> {
    if (!counters.truncated) {
      await this.locationsService.markReviewSync(location.urn, startedAt);
    }

    const result: SyncResult = { locationUrn: location.urn, ...counters, startedAt, finishedAt: new Date() };
    this.logger.log(
      `Synced ${location.urn}: ${result.imported} new, ${result.updated} updated, ${result.unchanged} unchanged, ` +
        `${result.deleted} deleted in ${result.pages} page(s)${result.full ? ' (full)' : ''}` +
        `${result.truncated ? ' [TRUNCATED: marker not advanced]' : ''}`,
    );

    return result;
  }

  private refFor(location: Location): GoogleLocationRef {
    return { accountName: location.googleAccountName, locationId: location.googleLocationId };
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      // Si falla, `lastReviewSyncAt` no se toca: la proxima corrida reintenta el mismo tramo.
      if (error instanceof GoogleApiError) {
        return throwAsDomainError(error);
      }

      throw error;
    }
  }
}
