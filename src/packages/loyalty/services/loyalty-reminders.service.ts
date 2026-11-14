import { Injectable } from '@nestjs/common';

import { CryptoService } from '@shared/common/crypto';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser, Paginated, paginate } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';

import config from '../config';
import * as DTO from '../dtos';
import { LoyaltyMember, LoyaltyMembersRepository, LoyaltyProgram, RemindersOptOutBy } from '../models';
import { MEMBER_CODE_PATTERN, todayIn } from '../utils';
import { LoyaltyProgramsService, OwnedProgram, isOperable } from './loyalty-programs.service';
import { StaffLoyaltyMember, toStaffMember } from './loyalty-members.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const inactiveDaysOf = (program: LoyaltyProgram): number =>
  program.inactiveDays ?? config.Reminders.DefaultInactiveDays;

/** Un recordatorio recomendado: a quien, de que sucursal y el mensaje ya armado, con el link al final. */
export interface LoyaltyReminder {
  member: StaffLoyaltyMember;
  program: { urn: string; locationTitle: string };
  reason: DTO.LoyaltyReminderReason;
  missingStamps: number;
  /** Dias desde su ultima visita: el ultimo sello o, si no tiene, el alta. */
  daysSinceVisit: number;
  message: string;
}

export interface ReminderContext {
  name: string;
  stamps: number;
  stampsRequired: number;
  missingStamps: number;
  rewardDescription: string;
  businessName: string;
  locationTitle: string;
  cardUrl: string;
}

/**
 * Arma el mensaje: reemplaza las variables y agrega el link de la tarjeta al final, siempre (no es
 * una variable, para que no se pueda borrar sin querer).
 */
export function renderReminder(template: string, context: ReminderContext): string {
  const values: Record<(typeof config.Reminders.Placeholders)[number], string> = {
    nombre: context.name.trim().split(/\s+/)[0] ?? context.name,
    faltan: context.missingStamps === 1 ? '1 sello' : `${String(context.missingStamps)} sellos`,
    sellos: `${String(context.stamps)} de ${String(context.stampsRequired)} sellos`,
    premio: context.rewardDescription,
    negocio: context.businessName,
    sucursal: context.locationTitle,
  };
  const text = template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? values[name as keyof typeof values] : match,
  );
  return `${text.trim()}\n${context.cardUrl}`;
}

/**
 * Recordatorios por WhatsApp: el local los manda desde su WhatsApp (link `wa.me`), no Opinara.
 * Aca se decide a quien conviene recordarle y se arma el mensaje con la plantilla de la sucursal.
 */
@Injectable()
export class LoyaltyRemindersService {
  constructor(
    private readonly membersRepository: LoyaltyMembersRepository,
    private readonly programsService: LoyaltyProgramsService,
    private readonly crypto: CryptoService,
  ) {}

  async list(business: Business, query: DTO.ListReminders): Promise<Paginated<LoyaltyReminder>> {
    const page = query.page ?? 0;
    const limit = query.limit ?? config.Reminders.DefaultPageSize;
    const programs = await this.operablePrograms(business, query.programUrn);
    const timezone = business.timezone ?? config.Reminders.DefaultTimezone;

    const now = new Date();
    const { items, total } = await this.membersRepository.reminderCandidates(
      business.urn,
      programs.map(({ program }) => ({ ...program, inactiveDays: inactiveDaysOf(program) })),
      {
        maxMissing: config.Reminders.MaxMissingStamps,
        today: todayIn(timezone, now),
        timezone,
        now,
        reasons: {
          nearReward: query.reason !== DTO.LoyaltyReminderReason.INACTIVE,
          inactive: query.reason !== DTO.LoyaltyReminderReason.NEAR_REWARD,
        },
        page,
        limit,
      },
    );

    const byUrn = new Map(programs.map((owned) => [owned.program.urn, owned]));
    const reminders = items.flatMap((member) => {
      const owned = byUrn.get(member.programUrn);
      return owned ? [this.toReminder(business, owned, member, now)] : [];
    });

    return paginate(reminders, page, limit, total);
  }

  /**
   * El local abrio WhatsApp para mandarlo: se anota, y no se vuelve a recomendar hasta su proximo
   * sello. No pide el permiso de promociones: es un aviso sobre la tarjeta que el cliente saco, y lo
   * manda el local desde su WhatsApp. Si pidio no recibirlos, no.
   */
  async markSent(business: Business, user: AuthenticatedUser, memberCode: string): Promise<void> {
    const member = await this.getByCode(business.urn, memberCode);
    if (member.remindersOptOut) {
      return Exceptions.conflict(Errors.LOYALTY_REMINDERS_OPTED_OUT);
    }

    if (!(await this.membersRepository.markReminded(business.urn, member.urn, new Date(), user.urn))) {
      // En el medio borro sus datos o pidio no recibir mas.
      return Exceptions.conflict(Errors.LOYALTY_REMINDERS_OPTED_OUT);
    }
  }

  /**
   * El local deja de mandarle recordatorios porque el cliente se lo pidio (o vuelve a mandarle). Si
   * los apago el cliente desde su tarjeta, el local no los puede volver a prender: solo el cliente.
   */
  async setForMember(
    business: Business,
    user: AuthenticatedUser,
    memberCode: string,
    { enabled }: DTO.SetReminders,
  ): Promise<StaffLoyaltyMember> {
    const member = await this.getByCode(business.urn, memberCode);
    if (enabled && member.remindersOptOut?.by === RemindersOptOutBy.CLIENT) {
      return Exceptions.conflict(Errors.LOYALTY_REMINDERS_OPTED_OUT);
    }

    const optOut = enabled
      ? null
      : (member.remindersOptOut ?? { at: new Date(), by: RemindersOptOutBy.BUSINESS, byUserUrn: user.urn });
    const updated = await this.membersRepository.setRemindersOptOut(business.urn, member.urn, optOut);
    if (!updated) {
      return Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND);
    }

    const { program } = await this.programsService.getOwned(business.urn, updated.programUrn);
    return toStaffMember(updated, program);
  }

  private async getByCode(businessUrn: string, memberCode: string): Promise<LoyaltyMember> {
    const code = memberCode.toUpperCase();
    const member = MEMBER_CODE_PATTERN.test(code) ? await this.membersRepository.findByCode(businessUrn, code) : null;
    if (!member) {
      return Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND);
    }
    return member;
  }

  /** Las sucursales que estan funcionando: a una pausada no se la invita a volver. */
  private async operablePrograms(business: Business, programUrn?: string): Promise<OwnedProgram[]> {
    if (programUrn) {
      const owned = await this.programsService.getOwned(business.urn, programUrn);
      return isOperable(owned) ? [owned] : [];
    }

    return (await this.programsService.findAllOwned(business.urn)).filter(isOperable);
  }

  private toReminder(
    business: Business,
    { program, location }: OwnedProgram,
    member: LoyaltyMember,
    now: Date,
  ): LoyaltyReminder {
    const locationTitle = location?.title ?? '';
    const missingStamps = program.stampsRequired - member.stamps;
    // La misma cuenta que el filtro: con 1 o 2 de falta y al menos un sello, gana "cerca del premio".
    const reason =
      member.stamps >= 1 && missingStamps <= config.Reminders.MaxMissingStamps
        ? DTO.LoyaltyReminderReason.NEAR_REWARD
        : DTO.LoyaltyReminderReason.INACTIVE;
    const lastVisit = member.lastStampAt ?? member.createdAt ?? now;

    return {
      member: toStaffMember(member, program),
      program: { urn: program.urn, locationTitle },
      reason,
      missingStamps,
      daysSinceVisit: Math.floor((now.getTime() - lastVisit.getTime()) / DAY_MS),
      message: renderReminder(this.template(program, reason), {
        name: member.name,
        stamps: member.stamps,
        stampsRequired: program.stampsRequired,
        missingStamps,
        rewardDescription: program.rewardDescription,
        businessName: business.name,
        locationTitle,
        cardUrl: config.CardUrl(this.crypto.decrypt(member.cardToken)),
      }),
    };
  }

  private template(program: LoyaltyProgram, reason: DTO.LoyaltyReminderReason): string {
    return reason === DTO.LoyaltyReminderReason.NEAR_REWARD
      ? (program.reminderMessage ?? config.Reminders.DefaultMessage)
      : (program.inactiveReminderMessage ?? config.Reminders.DefaultInactiveMessage);
  }
}
