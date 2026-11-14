import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Business } from '@shared/models/business';
import { BusinessPlan, Feature, PLAN_FEATURES } from '@shared/models/enums/plan';
import { Location } from '@packages/locations';
import { LoyaltyEvent, LoyaltyEventType, LoyaltyMember, LoyaltyProgram, LoyaltyProgramStatus } from '@packages/loyalty';

import config from '../config';
import * as DTO from '../dtos';

import { weekWindow, weeklyCounts } from './weekly';

export interface LoyaltyRankingRow {
  urn: string;
  business: { urn: string; name: string } | null;
  location: { urn: string; title: string } | null;
  status: LoyaltyProgramStatus;
  stampsRequired: number;
  members: number;
  stampsInPeriod: number;
  redemptionsInPeriod: number;
  stampsTotal: number;
  redemptionsTotal: number;
}

export interface LoyaltyReport {
  /** Sellos y canjes vigentes (sin los deshechos) y clientes nuevos, por semana. */
  weeks: { week: string; stamps: number; redemptions: number; members: number }[];
  inPeriod: { stamps: number; redemptions: number; members: number; corrections: number };
  totals: {
    members: number;
    stamps: number;
    redemptions: number;
    /** Clientes con el premio listo para canjear. */
    rewardsPending: number;
  };
  reminders: {
    /** Clientes a los que se les mandó al menos un recordatorio. */
    reminded: number;
    /** De esos, los que sumaron un sello después del último: el recordatorio funcionó. */
    cameBack: number;
    /** Pidieron no recibir más (desde su tarjeta o por el local). */
    optedOut: number;
  };
  programs: { total: number; active: number; paused: number };
  /** Sin filtro de negocio: cuántos tienen la tarjeta en el plan y cuántos la crearon. */
  businesses: { withPlan: number; withProgram: number };
  /** Las sucursales con más sellos en el período (y, a igualdad, en total). */
  ranking: LoyaltyRankingRow[];
}

const DEFAULT_WEEKS = 12;
const RANKING_SIZE = 50;
const LOYALTY_PLANS = (Object.keys(PLAN_FEATURES) as BusinessPlan[]).filter((plan) =>
  PLAN_FEATURES[plan].includes(Feature.LOYALTY),
);

/** La tarjeta de sellos en toda la plataforma, o en un negocio. Solo lectura. */
@Injectable()
export class AdminLoyaltyService {
  constructor(
    @InjectModel(LoyaltyProgram.name) private readonly programModel: Model<LoyaltyProgram>,
    @InjectModel(LoyaltyMember.name) private readonly memberModel: Model<LoyaltyMember>,
    @InjectModel(LoyaltyEvent.name) private readonly eventModel: Model<LoyaltyEvent>,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
  ) {}

  async report(dto: DTO.Loyalty, now: Date = new Date()): Promise<LoyaltyReport> {
    const { mondays, since } = weekWindow(dto.weeks ?? DEFAULT_WEEKS, now);
    const scope = dto.businessUrn ? { businessUrn: dto.businessUrn } : {};
    const live = { ...scope, undoneAt: null };

    const programs = await this.programModel.find(scope).lean<LoyaltyProgram[]>().exec();
    const rewardReady: FilterQuery<LoyaltyMember> =
      programs.length === 0
        ? { _id: null }
        : { $or: programs.map((program) => ({ programUrn: program.urn, stamps: { $gte: program.stampsRequired } })) };

    const [
      stampsByWeek,
      redemptionsByWeek,
      membersByWeek,
      correctionsByWeek,
      byProgram,
      members,
      rewardsPending,
      reminded,
      cameBack,
      optedOut,
      withPlan,
    ] = await Promise.all([
      weeklyCounts(this.eventModel, 'createdAt', since, { ...live, type: LoyaltyEventType.STAMP }),
      weeklyCounts(this.eventModel, 'createdAt', since, { ...live, type: LoyaltyEventType.REDEMPTION }),
      weeklyCounts(this.memberModel, 'createdAt', since, scope),
      weeklyCounts(this.eventModel, 'createdAt', since, { ...live, type: LoyaltyEventType.STAMP_REMOVAL }),
      this.eventsByProgram(live, since, new Set(mondays)),
      this.memberModel.countDocuments(scope).exec(),
      this.memberModel.countDocuments({ ...scope, ...rewardReady }).exec(),
      this.memberModel.countDocuments({ ...scope, lastReminderAt: { $ne: null } }).exec(),
      this.memberModel
        .countDocuments({
          ...scope,
          lastReminderAt: { $ne: null },
          $expr: { $gt: ['$lastStampAt', '$lastReminderAt'] },
        })
        .exec(),
      this.memberModel.countDocuments({ ...scope, remindersOptOut: { $ne: null } }).exec(),
      this.businessModel
        .countDocuments({ ...(dto.businessUrn ? { urn: dto.businessUrn } : {}), plan: { $in: LOYALTY_PLANS } })
        .exec(),
    ]);

    const weeks = mondays.map((week) => ({
      week,
      stamps: stampsByWeek.get(week) ?? 0,
      redemptions: redemptionsByWeek.get(week) ?? 0,
      members: membersByWeek.get(week) ?? 0,
    }));
    const inPeriod = (counts: Map<string, number>) => mondays.reduce((sum, week) => sum + (counts.get(week) ?? 0), 0);

    const period = (urn: string) => byProgram.get(urn) ?? { stamps: 0, redemptions: 0 };
    const ranked = [...programs]
      .sort(
        (a, b) =>
          period(b.urn).stamps - period(a.urn).stamps ||
          b.stats.stamps - a.stats.stamps ||
          b.stats.members - a.stats.members,
      )
      .slice(0, RANKING_SIZE);

    const [businesses, locations] = await Promise.all([
      this.businessModel
        .find({ urn: { $in: [...new Set(ranked.map((program) => program.businessUrn))] } })
        .select('urn name')
        .lean<Pick<Business, 'urn' | 'name'>[]>()
        .exec(),
      this.locationModel
        .find({ urn: { $in: [...new Set(ranked.map((program) => program.locationUrn))] } })
        .select('urn title')
        .lean<Pick<Location, 'urn' | 'title'>[]>()
        .exec(),
    ]);
    const businessByUrn = new Map(businesses.map((business) => [business.urn, business]));
    const locationByUrn = new Map(locations.map((location) => [location.urn, location]));

    return {
      weeks,
      inPeriod: {
        stamps: inPeriod(stampsByWeek),
        redemptions: inPeriod(redemptionsByWeek),
        members: inPeriod(membersByWeek),
        corrections: inPeriod(correctionsByWeek),
      },
      totals: {
        members,
        stamps: programs.reduce((sum, program) => sum + program.stats.stamps, 0),
        redemptions: programs.reduce((sum, program) => sum + program.stats.redemptions, 0),
        rewardsPending,
      },
      reminders: { reminded, cameBack, optedOut },
      programs: {
        total: programs.length,
        active: programs.filter((program) => program.status === LoyaltyProgramStatus.ACTIVE).length,
        paused: programs.filter((program) => program.status === LoyaltyProgramStatus.PAUSED).length,
      },
      businesses: { withPlan, withProgram: new Set(programs.map((program) => program.businessUrn)).size },
      ranking: ranked.map((program) => {
        const business = businessByUrn.get(program.businessUrn);
        const location = locationByUrn.get(program.locationUrn);
        return {
          urn: program.urn,
          business: business ? { urn: business.urn, name: business.name } : null,
          location: location ? { urn: location.urn, title: location.title } : null,
          status: program.status,
          stampsRequired: program.stampsRequired,
          members: program.stats.members,
          stampsInPeriod: period(program.urn).stamps,
          redemptionsInPeriod: period(program.urn).redemptions,
          stampsTotal: program.stats.stamps,
          redemptionsTotal: program.stats.redemptions,
        };
      }),
    };
  }

  /**
   * Sellos y canjes vigentes por programa dentro de las semanas del período. Como en escaneos, se
   * agrupa también por semana para descartar el día de margen de `since`: así el ranking cierra con
   * el gráfico.
   */
  private async eventsByProgram(
    match: FilterQuery<LoyaltyEvent>,
    since: Date,
    mondays: Set<string>,
  ): Promise<Map<string, { stamps: number; redemptions: number }>> {
    const timezone = config.Timezone;
    const rows = await this.eventModel
      .aggregate<{ _id: { program: string; type: LoyaltyEventType; week: string }; count: number }>([
        {
          $match: {
            ...match,
            type: { $in: [LoyaltyEventType.STAMP, LoyaltyEventType.REDEMPTION] },
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: {
              program: '$programUrn',
              type: '$type',
              week: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday', timezone } },
                  timezone,
                },
              },
            },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const byProgram = new Map<string, { stamps: number; redemptions: number }>();
    for (const row of rows) {
      if (!mondays.has(row._id.week)) continue;
      const current = byProgram.get(row._id.program) ?? { stamps: 0, redemptions: 0 };
      if (row._id.type === LoyaltyEventType.STAMP) current.stamps += row.count;
      else current.redemptions += row.count;
      byProgram.set(row._id.program, current);
    }
    return byProgram;
  }
}
