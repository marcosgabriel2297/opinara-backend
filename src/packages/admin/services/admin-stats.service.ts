import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Campaign, ScanEvent } from '@packages/campaigns';
import { GoogleConnection } from '@packages/google';
import { Location } from '@packages/locations';
import { Review } from '@packages/reviews';
import { Business } from '@shared/models/business';
import { BusinessStatus } from '@shared/models/enums/business';
import { CampaignStatus } from '@shared/models/enums/campaign';
import { GoogleConnectionStatus } from '@shared/models/enums/google';
import { UserStatus } from '@shared/models/enums/user';
import { User } from '@shared/models/user';

import config from '../config';
import * as DTO from '../dtos';

import { weekWindow, weeklyCounts } from './weekly';

export interface OverviewWeek {
  /** Lunes de la semana, `YYYY-MM-DD`. */
  week: string;
  users: number;
  businesses: number;
  reviews: number;
  scans: number;
}

export interface PlatformOverview {
  users: { total: number; active: number; pendingPasswordChange: number };
  businesses: { total: number; active: number; suspended: number; googleConnected: number };
  locations: number;
  campaigns: { total: number; active: number };
  reviews: { total: number; unanswered: number; averageRating: number | null };
  /** Incluye los escaneos anteriores a `scansTrackedSince`, que no tienen fecha. */
  scans: { total: number };
  weeks: OverviewWeek[];
  /** Primer escaneo con fecha: antes de eso, las semanas dan 0 aunque haya habido escaneos. */
  scansTrackedSince: Date | null;
  timezone: string;
}

const DEFAULT_WEEKS = 12;

/** Las cifras de toda la plataforma para la pantalla de inicio del panel. Solo lectura. */
@Injectable()
export class AdminStatsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(Campaign.name) private readonly campaignModel: Model<Campaign>,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(ScanEvent.name) private readonly scanEventModel: Model<ScanEvent>,
    @InjectModel(GoogleConnection.name) private readonly connectionModel: Model<GoogleConnection>,
  ) {}

  async overview(dto: DTO.Overview, now: Date = new Date()): Promise<PlatformOverview> {
    const { mondays, since } = weekWindow(dto.weeks ?? DEFAULT_WEEKS, now);
    const liveReviews = { deletedAt: { $exists: false } };

    const [
      users,
      activeUsers,
      pendingPasswordChange,
      businesses,
      activeBusinesses,
      suspendedBusinesses,
      googleConnected,
      locations,
      campaigns,
      activeCampaigns,
      reviews,
      scans,
      firstScan,
      usersByWeek,
      businessesByWeek,
      reviewsByWeek,
      scansByWeek,
    ] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.userModel.countDocuments({ status: UserStatus.ACTIVE }).exec(),
      this.userModel.countDocuments({ status: UserStatus.ACTIVE, mustChangePassword: true }).exec(),
      this.businessModel.countDocuments().exec(),
      this.businessModel.countDocuments({ status: BusinessStatus.ACTIVE }).exec(),
      this.businessModel.countDocuments({ status: BusinessStatus.SUSPENDED }).exec(),
      // Una conexión por negocio (índice único): contar conexiones activas es contar negocios.
      this.connectionModel.countDocuments({ status: GoogleConnectionStatus.ACTIVE }).exec(),
      this.locationModel.countDocuments().exec(),
      this.campaignModel.countDocuments().exec(),
      this.campaignModel.countDocuments({ status: CampaignStatus.ACTIVE }).exec(),
      this.reviewTotals(liveReviews),
      this.campaignModel
        .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: '$stats.scans' } } }])
        .exec()
        .then(([row]) => row?.total ?? 0),
      this.scanEventModel
        .findOne()
        .sort({ scannedAt: 1 })
        .select('scannedAt')
        .lean<Pick<ScanEvent, 'scannedAt'> | null>()
        .exec(),
      weeklyCounts(this.userModel, 'createdAt', since),
      weeklyCounts(this.businessModel, 'createdAt', since),
      weeklyCounts(this.reviewModel, 'googleCreateTime', since, liveReviews),
      weeklyCounts(this.scanEventModel, 'scannedAt', since),
    ]);

    return {
      users: { total: users, active: activeUsers, pendingPasswordChange },
      businesses: {
        total: businesses,
        active: activeBusinesses,
        suspended: suspendedBusinesses,
        googleConnected,
      },
      locations,
      campaigns: { total: campaigns, active: activeCampaigns },
      reviews,
      scans: { total: scans },
      // Todas las semanas, también las vacías: el gráfico no puede saltearse ninguna.
      weeks: mondays.map((week) => ({
        week,
        users: usersByWeek.get(week) ?? 0,
        businesses: businessesByWeek.get(week) ?? 0,
        reviews: reviewsByWeek.get(week) ?? 0,
        scans: scansByWeek.get(week) ?? 0,
      })),
      scansTrackedSince: firstScan?.scannedAt ?? null,
      timezone: config.Timezone,
    };
  }

  /** El promedio excluye las reseñas sin calificación (`starRating` 0): no son un cero. */
  private async reviewTotals(match: FilterQuery<Review>): Promise<PlatformOverview['reviews']> {
    const [row] = await this.reviewModel
      .aggregate<PlatformOverview['reviews']>([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unanswered: { $sum: { $cond: [{ $not: [{ $ifNull: ['$reply', false] }] }, 1, 0] } },
            averageRating: { $avg: { $cond: [{ $gt: ['$starRating', 0] }, '$starRating', null] } },
          },
        },
        { $project: { _id: 0 } },
      ])
      .exec();

    return row ?? { total: 0, unanswered: 0, averageRating: null };
  }
}
