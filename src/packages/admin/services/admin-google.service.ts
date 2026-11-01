import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Business } from '@shared/models/business';
import { BusinessStatus } from '@shared/models/enums/business';
import { GoogleConnectionStatus } from '@shared/models/enums/google';
import { LocationSource } from '@shared/models/enums/location';
import { GoogleConnection } from '@packages/google';
import { Location } from '@packages/locations';
import reviewsConfig from '@packages/reviews/config';

import config from '../config';

export enum GoogleIssueKind {
  /** Google dejó de aceptar la conexión (la revocaron o el token venció): hay que reconectar. */
  CONNECTION_REVOKED = 'CONNECTION_REVOKED',
  /** El negocio la desconectó desde su dashboard. */
  CONNECTION_DISCONNECTED = 'CONNECTION_DISCONNECTED',
  /** Conectó Google pero no importó ninguna sucursal: no hay nada que sincronizar. */
  NO_GOOGLE_LOCATIONS = 'NO_GOOGLE_LOCATIONS',
  /** Hay sucursales de Google que hace horas no se sincronizan (o nunca). */
  STALE_LOCATIONS = 'STALE_LOCATIONS',
}

export interface GoogleIssue {
  kind: GoogleIssueKind;
  business: { urn: string; name: string };
  connection: { status: GoogleConnectionStatus; connectedAt: Date | null; revokedAt: Date | null };
  /** La sincronización más reciente de cualquiera de sus sucursales. */
  lastSyncAt: Date | null;
  staleLocations: { urn: string; title: string; lastReviewSyncAt: Date | null }[];
}

export interface GoogleHealth {
  /** Con la sincronización apagada (`REVIEW_SYNC_ENABLED=false`), toda sucursal queda atrasada. */
  syncEnabled: boolean;
  staleAfterHours: number;
  businesses: { connected: number; revoked: number; disconnected: number; neverConnected: number };
  locations: { google: number; stale: number; manual: number };
  issues: GoogleIssue[];
}

/** El orden del listado: primero lo que hay que resolver ya. */
const SEVERITY: Record<GoogleIssueKind, number> = {
  [GoogleIssueKind.CONNECTION_REVOKED]: 0,
  [GoogleIssueKind.STALE_LOCATIONS]: 1,
  [GoogleIssueKind.NO_GOOGLE_LOCATIONS]: 2,
  [GoogleIssueKind.CONNECTION_DISCONNECTED]: 3,
};

/**
 * Cómo anda la integración con Google en toda la plataforma: qué negocios necesitan reconectar
 * y qué sucursales no se están sincronizando. Solo lectura, y nunca toca los tokens.
 *
 * Los negocios suspendidos no cuentan como problema: no tienen por qué estar sincronizando.
 */
@Injectable()
export class AdminGoogleService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(GoogleConnection.name) private readonly connectionModel: Model<GoogleConnection>,
  ) {}

  async health(now: Date = new Date()): Promise<GoogleHealth> {
    const staleBefore = new Date(now.getTime() - config.Google.StaleAfterHours * 60 * 60 * 1000);

    const [businesses, connections, locations] = await Promise.all([
      this.businessModel
        .find({ status: BusinessStatus.ACTIVE })
        .select('urn name')
        .sort({ name: 1 })
        .lean<Pick<Business, 'urn' | 'name'>[]>()
        .exec(),
      this.connectionModel
        .find()
        .select('businessUrn status connectedAt revokedAt')
        .lean<Pick<GoogleConnection, 'businessUrn' | 'status' | 'connectedAt' | 'revokedAt'>[]>()
        .exec(),
      this.locationModel
        .find({ isActive: true })
        .select('urn title businessUrn source lastReviewSyncAt')
        .sort({ title: 1 })
        .lean<Pick<Location, 'urn' | 'title' | 'businessUrn' | 'source' | 'lastReviewSyncAt'>[]>()
        .exec(),
    ]);

    const connectionByBusiness = new Map(connections.map((connection) => [connection.businessUrn, connection]));
    const isStale = (location: Pick<Location, 'lastReviewSyncAt'>) =>
      !location.lastReviewSyncAt || location.lastReviewSyncAt < staleBefore;

    const issues: GoogleIssue[] = [];
    const counts = { connected: 0, revoked: 0, disconnected: 0, neverConnected: 0 };
    let staleCount = 0;

    for (const business of businesses) {
      const connection = connectionByBusiness.get(business.urn);
      if (!connection) {
        counts.neverConnected += 1;
        continue;
      }

      const own = locations.filter((location) => location.businessUrn === business.urn);
      const google = own.filter((location) => location.source === LocationSource.GOOGLE);
      const stale = google.filter(isStale);
      const synced = google.flatMap((location) => (location.lastReviewSyncAt ? [location.lastReviewSyncAt] : []));
      const lastSyncAt = synced.length === 0 ? null : new Date(Math.max(...synced.map((date) => date.getTime())));
      const issue = (kind: GoogleIssueKind, staleLocations: typeof stale = []): GoogleIssue => ({
        kind,
        business: { urn: business.urn, name: business.name },
        connection: {
          status: connection.status,
          connectedAt: connection.connectedAt ?? null,
          revokedAt: connection.revokedAt ?? null,
        },
        lastSyncAt,
        staleLocations: staleLocations.map((location) => ({
          urn: location.urn,
          title: location.title,
          lastReviewSyncAt: location.lastReviewSyncAt ?? null,
        })),
      });

      if (connection.status === GoogleConnectionStatus.REVOKED) {
        counts.revoked += 1;
        issues.push(issue(GoogleIssueKind.CONNECTION_REVOKED));
      } else if (connection.status === GoogleConnectionStatus.DISCONNECTED) {
        counts.disconnected += 1;
        issues.push(issue(GoogleIssueKind.CONNECTION_DISCONNECTED));
      } else {
        counts.connected += 1;
        staleCount += stale.length;
        if (google.length === 0) issues.push(issue(GoogleIssueKind.NO_GOOGLE_LOCATIONS));
        else if (stale.length > 0) issues.push(issue(GoogleIssueKind.STALE_LOCATIONS, stale));
      }
    }

    const activeUrns = new Set(businesses.map((business) => business.urn));
    const ofActive = locations.filter((location) => activeUrns.has(location.businessUrn));

    return {
      syncEnabled: reviewsConfig.Sync.Enabled,
      staleAfterHours: config.Google.StaleAfterHours,
      businesses: counts,
      locations: {
        google: ofActive.filter((location) => location.source === LocationSource.GOOGLE).length,
        stale: staleCount,
        manual: ofActive.filter((location) => location.source === LocationSource.MANUAL).length,
      },
      issues: issues.sort(
        (a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || a.business.name.localeCompare(b.business.name),
      ),
    };
  }
}
