import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Paginated, paginate } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { User } from '@shared/models/user';
import { escapeRegex } from '@shared/utils';
import { Location } from '@packages/locations';
import {
  LoyaltyEvent,
  LoyaltyEventType,
  LoyaltyMember,
  LoyaltyProgram,
  LoyaltyProgramStatus,
  RemindersOptOutBy,
} from '@packages/loyalty';

import * as DTO from '../dtos';

/** Quién del local hizo algo: lo que se ve en el historial. */
export interface AdminLoyaltyActor {
  urn: string;
  name: string | null;
  email: string | null;
}

/** Un cliente de la tarjeta de sellos con todos sus datos, como lo ve el panel. */
export interface AdminLoyaltyMember {
  urn: string;
  memberCode: string;
  name: string;
  phone: string;
  email: string | null;
  business: { urn: string; name: string } | null;
  program: {
    urn: string;
    status: LoyaltyProgramStatus | null;
    stampsRequired: number | null;
    rewardDescription: string | null;
  };
  location: { urn: string; title: string } | null;
  stamps: number;
  rewardAvailable: boolean;
  totalStamps: number;
  totalRedemptions: number;
  lastStampAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  consent: { acceptedAt: Date; termsVersion: string; marketing: boolean };
  reminders: {
    lastReminderAt: Date | null;
    lastReminderBy: AdminLoyaltyActor | null;
    /** Sumó un sello después del último recordatorio. */
    cameBack: boolean;
    optOut: { at: Date; by: RemindersOptOutBy; byUser: AdminLoyaltyActor | null } | null;
  };
}

export interface AdminLoyaltyEvent {
  urn: string;
  type: LoyaltyEventType;
  amount: number;
  createdAt: Date | null;
  by: AdminLoyaltyActor;
  undoneAt: Date | null;
  undoneBy: AdminLoyaltyActor | null;
}

export interface AdminLoyaltyMemberDetail extends AdminLoyaltyMember {
  /** Lo último primero. */
  events: AdminLoyaltyEvent[];
  /** Si hay más eventos que los que se devuelven. */
  eventsTruncated: boolean;
}

const EVENTS_LIMIT = 200;

/**
 * Los clientes de la tarjeta de sellos de toda la plataforma, con todos sus datos y su historial.
 * Solo lectura: editar o borrar un cliente le toca al comercio o al cliente desde su tarjeta.
 */
@Injectable()
export class AdminLoyaltyMembersService {
  constructor(
    @InjectModel(LoyaltyMember.name) private readonly memberModel: Model<LoyaltyMember>,
    @InjectModel(LoyaltyProgram.name) private readonly programModel: Model<LoyaltyProgram>,
    @InjectModel(LoyaltyEvent.name) private readonly eventModel: Model<LoyaltyEvent>,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async list(dto: DTO.ListLoyaltyMembers): Promise<Paginated<AdminLoyaltyMember>> {
    const page = dto.page ?? 0;
    const limit = dto.limit ?? DTO.ADMIN_DEFAULT_PAGE_SIZE;
    const filter: FilterQuery<LoyaltyMember> = {};
    if (dto.businessUrn) filter.businessUrn = dto.businessUrn;

    // Los clientes guardan el programa, no la sucursal: por sucursal se filtra por sus programas.
    if (dto.locationUrn) {
      const programs = await this.programModel
        .find({ ...(dto.businessUrn ? { businessUrn: dto.businessUrn } : {}), locationUrn: dto.locationUrn })
        .select('urn')
        .lean<Pick<LoyaltyProgram, 'urn'>[]>()
        .exec();
      filter.programUrn = { $in: programs.map((program) => program.urn) };
    }

    const search = dto.search?.trim();
    if (search) {
      const digits = search.replace(/\D/g, '');
      const code = search.toUpperCase().replace(/[\s-]/g, '');
      const text = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: text },
        { email: text },
        ...(digits.length >= 3 ? [{ phone: new RegExp(`${digits}$`) }] : []),
        ...(/^[A-Z0-9]{6}$/.test(code) ? [{ memberCode: code }] : []),
      ];
    }

    const [members, total] = await Promise.all([
      this.memberModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean<LoyaltyMember[]>()
        .exec(),
      this.memberModel.countDocuments(filter).exec(),
    ]);

    return paginate(await this.toRows(members), page, limit, total);
  }

  async findOne(urn: string): Promise<AdminLoyaltyMemberDetail> {
    const member = await this.memberModel.findOne({ urn }).lean<LoyaltyMember | null>().exec();
    if (!member) {
      return Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND);
    }

    const events = await this.eventModel
      .find({ businessUrn: member.businessUrn, memberUrn: member.urn })
      .sort({ createdAt: -1, _id: -1 })
      .limit(EVENTS_LIMIT + 1)
      .lean<LoyaltyEvent[]>()
      .exec();
    const shown = events.slice(0, EVENTS_LIMIT);

    const [row] = await this.toRows([member]);
    const actors = await this.actors(shown.flatMap((event) => [event.byUserUrn, event.undoneByUserUrn ?? '']));

    return {
      ...(row ?? Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND)),
      events: shown.map((event) => ({
        urn: event.urn,
        type: event.type,
        amount: event.amount,
        createdAt: event.createdAt ?? null,
        by: actors.get(event.byUserUrn) ?? { urn: event.byUserUrn, name: null, email: null },
        undoneAt: event.undoneAt ?? null,
        undoneBy: event.undoneByUserUrn
          ? (actors.get(event.undoneByUserUrn) ?? { urn: event.undoneByUserUrn, name: null, email: null })
          : null,
      })),
      eventsTruncated: events.length > EVENTS_LIMIT,
    };
  }

  /** Completa negocio, programa, sucursal y quién hizo los recordatorios, con una consulta por colección. */
  private async toRows(members: LoyaltyMember[]): Promise<AdminLoyaltyMember[]> {
    const programs = await this.programModel
      .find({ urn: { $in: [...new Set(members.map((member) => member.programUrn))] } })
      .lean<LoyaltyProgram[]>()
      .exec();
    const programByUrn = new Map(programs.map((program) => [program.urn, program]));

    const [businesses, locations, actors] = await Promise.all([
      this.businessModel
        .find({ urn: { $in: [...new Set(members.map((member) => member.businessUrn))] } })
        .select('urn name')
        .lean<Pick<Business, 'urn' | 'name'>[]>()
        .exec(),
      this.locationModel
        .find({ urn: { $in: [...new Set(programs.map((program) => program.locationUrn))] } })
        .select('urn title')
        .lean<Pick<Location, 'urn' | 'title'>[]>()
        .exec(),
      this.actors(
        members.flatMap((member) => [member.lastReminderByUserUrn ?? '', member.remindersOptOut?.byUserUrn ?? '']),
      ),
    ]);
    const businessByUrn = new Map(businesses.map((business) => [business.urn, business]));
    const locationByUrn = new Map(locations.map((location) => [location.urn, location]));
    const actor = (urn: string | undefined) => (urn ? (actors.get(urn) ?? { urn, name: null, email: null }) : null);

    return members.map((member) => {
      const program = programByUrn.get(member.programUrn);
      const business = businessByUrn.get(member.businessUrn);
      const location = program ? locationByUrn.get(program.locationUrn) : undefined;
      const lastReminderAt = member.lastReminderAt ?? null;

      return {
        urn: member.urn,
        memberCode: member.memberCode,
        name: member.name,
        phone: member.phone,
        email: member.email ?? null,
        business: business ? { urn: business.urn, name: business.name } : null,
        program: {
          urn: member.programUrn,
          status: program?.status ?? null,
          stampsRequired: program?.stampsRequired ?? null,
          rewardDescription: program?.rewardDescription ?? null,
        },
        location: location ? { urn: location.urn, title: location.title } : null,
        stamps: member.stamps,
        rewardAvailable: program !== undefined && member.stamps >= program.stampsRequired,
        totalStamps: member.totalStamps,
        totalRedemptions: member.totalRedemptions,
        lastStampAt: member.lastStampAt ?? null,
        createdAt: member.createdAt ?? null,
        updatedAt: member.updatedAt ?? null,
        consent: member.consent,
        reminders: {
          lastReminderAt,
          lastReminderBy: actor(member.lastReminderByUserUrn),
          cameBack:
            lastReminderAt !== null &&
            member.lastStampAt != null &&
            member.lastStampAt.getTime() > lastReminderAt.getTime(),
          optOut: member.remindersOptOut
            ? {
                at: member.remindersOptOut.at,
                by: member.remindersOptOut.by,
                byUser: actor(member.remindersOptOut.byUserUrn),
              }
            : null,
        },
      };
    });
  }

  private async actors(urns: string[]): Promise<Map<string, AdminLoyaltyActor>> {
    const unique = [...new Set(urns.filter((urn) => urn !== ''))];
    if (unique.length === 0) return new Map();

    const users = await this.userModel
      .find({ urn: { $in: unique } })
      .select('urn name email')
      .lean<Pick<User, 'urn' | 'name' | 'email'>[]>()
      .exec();
    return new Map(users.map((user) => [user.urn, { urn: user.urn, name: user.name, email: user.email }]));
  }
}
