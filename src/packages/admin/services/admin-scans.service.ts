import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Business } from '@shared/models/business';
import { CampaignStatus } from '@shared/models/enums/campaign';
import { Campaign, ScanEvent } from '@packages/campaigns';
import { Location } from '@packages/locations';

import config from '../config';
import * as DTO from '../dtos';

import { weekWindow, weeklyCounts } from './weekly';

export interface ScanRankingRow {
  urn: string;
  name: string;
  slug: string;
  status: CampaignStatus;
  business: { urn: string; name: string } | null;
  location: { urn: string; title: string } | null;
  /** Escaneos con fecha dentro del período. */
  scansInPeriod: number;
  /** Desde que existe la campaña, también los de antes de registrarse con fecha. */
  scansTotal: number;
}

export interface ScansReport {
  weeks: { week: string; scans: number }[];
  scansInPeriod: number;
  scansTotal: number;
  campaigns: { total: number; active: number; withoutScansInPeriod: number };
  /** Las campañas con más escaneos en el período (y, a igualdad, en total). */
  ranking: ScanRankingRow[];
  /** Primer escaneo con fecha bajo estos filtros: antes, las semanas dan 0 aunque haya habido. */
  trackedSince: Date | null;
}

const DEFAULT_WEEKS = 12;
const RANKING_SIZE = 50;

/** Escaneos de QR de toda la plataforma, o de un negocio o sucursal. Solo lectura. */
@Injectable()
export class AdminScansService {
  constructor(
    @InjectModel(Campaign.name) private readonly campaignModel: Model<Campaign>,
    @InjectModel(ScanEvent.name) private readonly scanEventModel: Model<ScanEvent>,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
  ) {}

  async report(dto: DTO.Scans, now: Date = new Date()): Promise<ScansReport> {
    const { mondays, since } = weekWindow(dto.weeks ?? DEFAULT_WEEKS, now);

    const campaignFilter: FilterQuery<Campaign> = {};
    if (dto.businessUrn) campaignFilter.businessUrn = dto.businessUrn;
    if (dto.locationUrn) campaignFilter.locationUrn = dto.locationUrn;
    const campaigns = await this.campaignModel.find(campaignFilter).lean<Campaign[]>().exec();

    // Los eventos guardan negocio y campaña, no sucursal: por sucursal se filtra por sus campañas.
    const scanFilter: FilterQuery<ScanEvent> = {};
    if (dto.businessUrn) scanFilter.businessUrn = dto.businessUrn;
    if (dto.locationUrn) scanFilter.campaignUrn = { $in: campaigns.map((campaign) => campaign.urn) };

    const [byWeek, byCampaign, firstScan] = await Promise.all([
      weeklyCounts(this.scanEventModel, 'scannedAt', since, scanFilter),
      this.scansByCampaign(scanFilter, since, new Set(mondays)),
      this.scanEventModel
        .findOne(scanFilter)
        .sort({ scannedAt: 1 })
        .select('scannedAt')
        .lean<Pick<ScanEvent, 'scannedAt'> | null>()
        .exec(),
    ]);

    const weeks = mondays.map((week) => ({ week, scans: byWeek.get(week) ?? 0 }));
    const ranked = [...campaigns]
      .sort(
        (a, b) =>
          (byCampaign.get(b.urn) ?? 0) - (byCampaign.get(a.urn) ?? 0) ||
          b.stats.scans - a.stats.scans ||
          a.name.localeCompare(b.name),
      )
      .slice(0, RANKING_SIZE);

    const [businesses, locations] = await Promise.all([
      this.businessModel
        .find({ urn: { $in: [...new Set(ranked.map((campaign) => campaign.businessUrn))] } })
        .select('urn name')
        .lean<Pick<Business, 'urn' | 'name'>[]>()
        .exec(),
      this.locationModel
        .find({ urn: { $in: [...new Set(ranked.map((campaign) => campaign.locationUrn))] } })
        .select('urn title')
        .lean<Pick<Location, 'urn' | 'title'>[]>()
        .exec(),
    ]);
    const businessByUrn = new Map(businesses.map((business) => [business.urn, business]));
    const locationByUrn = new Map(locations.map((location) => [location.urn, location]));

    return {
      weeks,
      scansInPeriod: weeks.reduce((sum, week) => sum + week.scans, 0),
      scansTotal: campaigns.reduce((sum, campaign) => sum + campaign.stats.scans, 0),
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter((campaign) => campaign.status === CampaignStatus.ACTIVE).length,
        withoutScansInPeriod: campaigns.filter((campaign) => !byCampaign.has(campaign.urn)).length,
      },
      ranking: ranked.map((campaign) => {
        const business = businessByUrn.get(campaign.businessUrn);
        const location = locationByUrn.get(campaign.locationUrn);
        return {
          urn: campaign.urn,
          name: campaign.name,
          slug: campaign.slug,
          status: campaign.status,
          business: business ? { urn: business.urn, name: business.name } : null,
          location: location ? { urn: location.urn, title: location.title } : null,
          scansInPeriod: byCampaign.get(campaign.urn) ?? 0,
          scansTotal: campaign.stats.scans,
        };
      }),
      trackedSince: firstScan?.scannedAt ?? null,
    };
  }

  /**
   * Escaneos por campaña dentro de las semanas del período. Se agrupa también por semana porque
   * `since` tiene un día de margen para la zona horaria: lo que cae fuera de esas semanas no cuenta,
   * igual que en el gráfico, así el ranking cierra con el total.
   */
  private async scansByCampaign(
    match: FilterQuery<ScanEvent>,
    since: Date,
    mondays: Set<string>,
  ): Promise<Map<string, number>> {
    const timezone = config.Timezone;
    const rows = await this.scanEventModel
      .aggregate<{ _id: { campaign: string; week: string }; count: number }>([
        { $match: { ...match, scannedAt: { $gte: since } } },
        {
          $group: {
            _id: {
              campaign: '$campaignUrn',
              week: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $dateTrunc: { date: '$scannedAt', unit: 'week', startOfWeek: 'monday', timezone } },
                  timezone,
                },
              },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const byCampaign = new Map<string, number>();
    for (const row of rows) {
      if (!mondays.has(row._id.week)) continue;
      byCampaign.set(row._id.campaign, (byCampaign.get(row._id.campaign) ?? 0) + row.count);
    }
    return byCampaign;
  }
}
