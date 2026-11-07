import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Paginated, paginate } from '@shared/common/interfaces';
import { Business, BusinessMember } from '@shared/models/business';
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@shared/models/enums/business';
import { CampaignStatus } from '@shared/models/enums/campaign';
import { GoogleConnectionStatus } from '@shared/models/enums/google';
import { LocationSource } from '@shared/models/enums/location';
import { BusinessPlan, DEFAULT_BUSINESS_PLAN } from '@shared/models/enums/plan';
import { User } from '@shared/models/user';
import { escapeRegex } from '@shared/utils';
import { Campaign, ScanEvent } from '@packages/campaigns';
import { GoogleConnection } from '@packages/google';
import { Location } from '@packages/locations';
import { Review } from '@packages/reviews';

import * as DTO from '../dtos';
import { AuthenticatedAdmin } from '../guards';
import { AuditAction, AuditTargetType } from '../models';

import { AdminAuditService } from './admin-audit.service';

interface ReviewStats {
  total: number;
  unanswered: number;
  averageRating: number | null;
}

interface GoogleState {
  status: GoogleConnectionStatus;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
}

export interface AdminBusinessRow {
  urn: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  plan: BusinessPlan;
  createdAt: Date | null;
  owner: { urn: string; name: string; email: string } | null;
  members: number;
  locations: number;
  google: GoogleState | null;
  reviews: ReviewStats;
  campaigns: { total: number; active: number };
  scans: number;
}

export interface AdminBusinessDetail extends Omit<AdminBusinessRow, 'members' | 'locations' | 'campaigns'> {
  timezone: string | null;
  members: { urn: string; name: string; email: string; role: BusinessMemberRole; since: Date | null }[];
  locations: {
    urn: string;
    title: string;
    address: string | null;
    source: LocationSource;
    isActive: boolean;
    lastReviewSyncAt: Date | null;
    reviews: ReviewStats;
    campaigns: number;
  }[];
  campaigns: {
    urn: string;
    name: string;
    slug: string;
    status: CampaignStatus;
    location: { urn: string; title: string } | null;
    scans: number;
    scansLast30Days: number;
    createdAt: Date | null;
  }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_REVIEWS: ReviewStats = { total: 0, unanswered: 0, averageRating: null };

/** Negocios de toda la plataforma: el listado con sus cifras y el detalle de cada uno. Solo lectura. */
@Injectable()
export class AdminBusinessesService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(BusinessMember.name) private readonly memberModel: Model<BusinessMember>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<Campaign>,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(ScanEvent.name) private readonly scanEventModel: Model<ScanEvent>,
    @InjectModel(GoogleConnection.name) private readonly connectionModel: Model<GoogleConnection>,
    private readonly audit: AdminAuditService,
  ) {}

  /**
   * Suspende o reactiva un negocio. Suspendido, su equipo no puede usar el dashboard
   * (`BUSINESS_SUSPENDED`), sus QR no llevan a Google y sus invitaciones dejan de servir. No se
   * borra nada: al reactivarlo vuelve todo como estaba. Repetir el mismo estado no deja otro evento.
   */
  async setStatus(admin: AuthenticatedAdmin, urn: string, status: BusinessStatus): Promise<AdminBusinessDetail> {
    const changed = await this.businessModel
      .findOneAndUpdate({ urn, status: { $ne: status } }, { $set: { status } }, { new: true })
      .lean<Business | null>()
      .exec();

    if (changed) {
      await this.audit.record(
        admin,
        status === BusinessStatus.SUSPENDED ? AuditAction.BUSINESS_SUSPENDED : AuditAction.BUSINESS_REACTIVATED,
        { type: AuditTargetType.BUSINESS, urn: changed.urn, label: changed.name },
      );
    }

    // Sin cambio: o ya estaba así (devuelve el detalle) o no existe (`detail` responde 404).
    return this.detail(urn);
  }

  /**
   * Cambia el plan del negocio. Mientras no haya cobro, es la unica forma de cambiarlo. Bajar de
   * plan no borra nada: lo que el plan ya no incluye deja de funcionar y vuelve si se sube otra vez.
   * Repetir el mismo plan no deja otro evento.
   */
  async setPlan(admin: AuthenticatedAdmin, urn: string, plan: BusinessPlan): Promise<AdminBusinessDetail> {
    const previous = await this.businessModel
      .findOneAndUpdate({ urn, plan: { $ne: plan } }, { $set: { plan } }, { new: false })
      .lean<Business | null>()
      .exec();

    if (previous) {
      await this.audit.record(admin, AuditAction.BUSINESS_PLAN_CHANGED, {
        type: AuditTargetType.BUSINESS,
        urn: previous.urn,
        label: `${previous.name}: ${previous.plan ?? DEFAULT_BUSINESS_PLAN} → ${plan}`,
      });
    }

    return this.detail(urn);
  }

  /** Negocios con sus sucursales: alimentan los filtros del panel. */
  async options(): Promise<
    { urn: string; name: string; slug: string; status: string; locations: { urn: string; title: string }[] }[]
  > {
    const [businesses, locations] = await Promise.all([
      this.businessModel
        .find()
        .select('urn name slug status')
        .sort({ name: 1 })
        .lean<Pick<Business, 'urn' | 'name' | 'slug' | 'status'>[]>()
        .exec(),
      this.locationModel
        .find()
        .select('urn title businessUrn')
        .sort({ title: 1 })
        .lean<Pick<Location, 'urn' | 'title' | 'businessUrn'>[]>()
        .exec(),
    ]);

    return businesses.map((business) => ({
      urn: business.urn,
      name: business.name,
      slug: business.slug,
      status: business.status,
      locations: locations
        .filter((location) => location.businessUrn === business.urn)
        .map((location) => ({ urn: location.urn, title: location.title })),
    }));
  }

  async list(dto: DTO.ListBusinesses): Promise<Paginated<AdminBusinessRow>> {
    const page = dto.page ?? 0;
    const limit = dto.limit ?? DTO.ADMIN_DEFAULT_PAGE_SIZE;
    const filter: FilterQuery<Business> = {};

    const search = dto.search?.trim();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: pattern }, { slug: pattern }];
    }
    if (dto.status) filter.status = dto.status;
    if (dto.google) {
      const connected = await this.connectionModel
        .distinct('businessUrn', { status: GoogleConnectionStatus.ACTIVE })
        .exec();
      filter.urn = dto.google === 'connected' ? { $in: connected } : { $nin: connected };
    }

    const sort: Record<string, SortOrder> = dto.order === 'name' ? { name: 1 } : { createdAt: -1 };
    const [businesses, total] = await Promise.all([
      this.businessModel
        .find(filter)
        .sort(sort)
        .skip(page * limit)
        .limit(limit)
        .lean<Business[]>()
        .exec(),
      this.businessModel.countDocuments(filter).exec(),
    ]);

    const urns = businesses.map((business) => business.urn);
    const [owners, members, locations, campaigns, reviews, connections] = await Promise.all([
      this.usersByUrn(businesses.map((business) => business.ownerUserUrn)),
      this.countBy(this.memberModel, { businessUrn: { $in: urns }, status: BusinessMemberStatus.ACTIVE }),
      this.countBy(this.locationModel, { businessUrn: { $in: urns } }),
      this.campaignTotals(urns),
      this.reviewStats({ businessUrn: { $in: urns } }, 'businessUrn'),
      this.connections(urns),
    ]);

    const items = businesses.map((business) => {
      const owner = owners.get(business.ownerUserUrn);
      const campaign = campaigns.get(business.urn);
      return {
        urn: business.urn,
        name: business.name,
        slug: business.slug,
        status: business.status,
        plan: business.plan ?? DEFAULT_BUSINESS_PLAN,
        createdAt: business.createdAt ?? null,
        owner: owner ? { urn: owner.urn, name: owner.name, email: owner.email } : null,
        members: members.get(business.urn) ?? 0,
        locations: locations.get(business.urn) ?? 0,
        google: connections.get(business.urn) ?? null,
        reviews: reviews.get(business.urn) ?? EMPTY_REVIEWS,
        campaigns: { total: campaign?.total ?? 0, active: campaign?.active ?? 0 },
        scans: campaign?.scans ?? 0,
      };
    });

    return paginate(items, page, limit, total);
  }

  async detail(urn: string, now: Date = new Date()): Promise<AdminBusinessDetail> {
    const business = await this.businessModel.findOne({ urn }).lean<Business | null>().exec();
    if (!business) {
      return Exceptions.notFound(Errors.BUSINESS_NOT_FOUND);
    }

    const [memberships, locations, campaigns, reviewsByLocation, reviewTotals, connections, recentScans] =
      await Promise.all([
        this.memberModel
          .find({ businessUrn: urn, status: BusinessMemberStatus.ACTIVE })
          .lean<BusinessMember[]>()
          .exec(),
        this.locationModel.find({ businessUrn: urn }).sort({ title: 1 }).lean<Location[]>().exec(),
        this.campaignModel.find({ businessUrn: urn }).sort({ 'stats.scans': -1, name: 1 }).lean<Campaign[]>().exec(),
        this.reviewStats({ businessUrn: urn }, 'locationUrn'),
        this.reviewStats({ businessUrn: urn }, 'businessUrn'),
        this.connections([urn]),
        this.countBy(
          this.scanEventModel,
          { businessUrn: urn, scannedAt: { $gte: new Date(now.getTime() - 30 * DAY_MS) } },
          'campaignUrn',
        ),
      ]);

    const users = await this.usersByUrn([business.ownerUserUrn, ...memberships.map((member) => member.userUrn)]);
    const owner = users.get(business.ownerUserUrn);
    const titleByUrn = new Map(locations.map((location) => [location.urn, location.title]));
    const roleOrder = { [BusinessMemberRole.OWNER]: 0, [BusinessMemberRole.ADMIN]: 1, [BusinessMemberRole.MEMBER]: 2 };

    return {
      urn: business.urn,
      name: business.name,
      slug: business.slug,
      status: business.status,
      plan: business.plan ?? DEFAULT_BUSINESS_PLAN,
      timezone: business.timezone ?? null,
      createdAt: business.createdAt ?? null,
      owner: owner ? { urn: owner.urn, name: owner.name, email: owner.email } : null,
      google: connections.get(urn) ?? null,
      reviews: reviewTotals.get(urn) ?? EMPTY_REVIEWS,
      scans: campaigns.reduce((sum, campaign) => sum + campaign.stats.scans, 0),
      members: memberships
        .flatMap((member) => {
          const user = users.get(member.userUrn);
          return user
            ? [
                {
                  urn: user.urn,
                  name: user.name,
                  email: user.email,
                  role: member.role,
                  since: member.createdAt ?? null,
                },
              ]
            : [];
        })
        .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name)),
      locations: locations.map((location) => ({
        urn: location.urn,
        title: location.title,
        address: location.address ?? null,
        source: location.source,
        isActive: location.isActive,
        lastReviewSyncAt: location.lastReviewSyncAt ?? null,
        reviews: reviewsByLocation.get(location.urn) ?? EMPTY_REVIEWS,
        campaigns: campaigns.filter((campaign) => campaign.locationUrn === location.urn).length,
      })),
      campaigns: campaigns.map((campaign) => ({
        urn: campaign.urn,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        location: titleByUrn.has(campaign.locationUrn)
          ? { urn: campaign.locationUrn, title: titleByUrn.get(campaign.locationUrn) ?? '' }
          : null,
        scans: campaign.stats.scans,
        scansLast30Days: recentScans.get(campaign.urn) ?? 0,
        createdAt: campaign.createdAt ?? null,
      })),
    };
  }

  private async usersByUrn(urns: string[]): Promise<Map<string, Pick<User, 'urn' | 'name' | 'email'>>> {
    const users = await this.userModel
      .find({ urn: { $in: [...new Set(urns)] } })
      .select('urn name email')
      .lean<Pick<User, 'urn' | 'name' | 'email'>[]>()
      .exec();
    return new Map(users.map((user) => [user.urn, user]));
  }

  /** Cuántos documentos hay por `key` (por defecto, por negocio). */
  private async countBy<T>(model: Model<T>, match: FilterQuery<T>, key = 'businessUrn'): Promise<Map<string, number>> {
    const rows = await model
      .aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: `$${key}`, count: { $sum: 1 } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id, row.count]));
  }

  private async campaignTotals(urns: string[]): Promise<Map<string, { total: number; active: number; scans: number }>> {
    const rows = await this.campaignModel
      .aggregate<{ _id: string; total: number; active: number; scans: number }>([
        { $match: { businessUrn: { $in: urns } } },
        {
          $group: {
            _id: '$businessUrn',
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', CampaignStatus.ACTIVE] }, 1, 0] } },
            scans: { $sum: '$stats.scans' },
          },
        },
      ])
      .exec();
    return new Map(rows.map(({ _id, ...totals }) => [_id, totals]));
  }

  /** Totales de reseñas agrupados por `key`. El promedio excluye las sin calificación (`starRating` 0). */
  private async reviewStats(
    match: FilterQuery<Review>,
    key: 'businessUrn' | 'locationUrn',
  ): Promise<Map<string, ReviewStats>> {
    const rows = await this.reviewModel
      .aggregate<ReviewStats & { _id: string }>([
        { $match: { ...match, deletedAt: { $exists: false } } },
        {
          $group: {
            _id: `$${key}`,
            total: { $sum: 1 },
            unanswered: { $sum: { $cond: [{ $not: [{ $ifNull: ['$reply', false] }] }, 1, 0] } },
            averageRating: { $avg: { $cond: [{ $gt: ['$starRating', 0] }, '$starRating', null] } },
          },
        },
      ])
      .exec();
    return new Map(rows.map(({ _id, ...stats }) => [_id, stats]));
  }

  /**
   * La conexión de Google de cada negocio (hay una por negocio, ver su índice único). Sin tokens.
   *
   * `lastSyncAt` es la sincronización más reciente de sus sucursales: la conexión tiene su propio
   * `lastSyncAt`, pero la sincronización nunca lo escribe (lo marca en cada sucursal).
   */
  private async connections(urns: string[]): Promise<Map<string, GoogleState>> {
    const [rows, synced] = await Promise.all([
      this.connectionModel
        .find({ businessUrn: { $in: urns } })
        .select('businessUrn status connectedAt')
        .lean<Pick<GoogleConnection, 'businessUrn' | 'status' | 'connectedAt'>[]>()
        .exec(),
      this.locationModel
        .aggregate<{ _id: string; lastSyncAt: Date | null }>([
          { $match: { businessUrn: { $in: urns } } },
          { $group: { _id: '$businessUrn', lastSyncAt: { $max: '$lastReviewSyncAt' } } },
        ])
        .exec(),
    ]);
    const lastSync = new Map(synced.map((row) => [row._id, row.lastSyncAt]));
    return new Map(
      rows.map((row) => [
        row.businessUrn,
        {
          status: row.status,
          connectedAt: row.connectedAt ?? null,
          lastSyncAt: lastSync.get(row.businessUrn) ?? null,
        },
      ]),
    );
  }
}
