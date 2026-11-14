import { Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '@shared/common/crypto';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser, Paginated, paginate } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import { Business, BusinessMember } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

import config from '../config';
import * as DTO from '../dtos';
import {
  LOYALTY_EVENT_ENTITY,
  LoyaltyEvent,
  LoyaltyEventType,
  LoyaltyEventsRepository,
  LoyaltyMember,
  LoyaltyMembersRepository,
  LoyaltyProgram,
  RemindersOptOutBy,
} from '../models';
import { MEMBER_CODE_PATTERN, generateCardToken, hashCardToken } from '../utils';
import { LoyaltyCardMailer } from './loyalty-card-mailer.service';
import { LoyaltyProgramsService, OwnedProgram, isOperable, renderQr } from './loyalty-programs.service';

const MINUTE_MS = 60 * 1000;

/** Quienes pueden sacar sellos (y deshacer esa correccion): solo ADMIN, a pedido del negocio; ni el OWNER. */
export const CORRECTION_ROLES: readonly BusinessMemberRole[] = [BusinessMemberRole.ADMIN];

/** Como vuelven los contadores del programa al deshacer cada accion. */
const STATS_REVERSAL: Record<LoyaltyEventType, (amount: number) => { stamps?: number; redemptions?: number }> = {
  [LoyaltyEventType.STAMP]: () => ({ stamps: -1 }),
  [LoyaltyEventType.REDEMPTION]: () => ({ redemptions: -1 }),
  [LoyaltyEventType.STAMP_REMOVAL]: (amount) => ({ stamps: amount }),
};

/** El cliente como lo ve la caja. */
export interface StaffLoyaltyMember {
  urn: string;
  memberCode: string;
  programUrn: string;
  name: string;
  phone: string;
  email: string | null;
  stamps: number;
  stampsRequired: number;
  rewardAvailable: boolean;
  totalStamps: number;
  totalRedemptions: number;
  lastStampAt: Date | null;
  /**
   * Desde cuando se puede sumar el proximo sello (`lastStampAt` + tiempo minimo del programa), para
   * que la caja lo muestre. `null` si nunca recibio uno o se deshizo el ultimo. Puede estar en el
   * pasado: entonces ya se puede.
   */
  nextStampAt: Date | null;
  /** Cuando se abrio WhatsApp para mandarle el ultimo recordatorio. */
  lastReminderAt: Date | null;
  /** Si pidio no recibir recordatorios, quien lo apago. `null`: se le pueden mandar. */
  remindersOptOutBy: RemindersOptOutBy | null;
  marketing: boolean;
  createdAt?: Date;
}

export interface StaffLoyaltyMemberDetail extends StaffLoyaltyMember {
  /** De que sucursal es la tarjeta: la caja avisa si no es la suya. */
  program: { urn: string; locationUrn: string; locationTitle: string };
}

export interface PublicLoyaltyEvent {
  urn: string;
  type: LoyaltyEventType;
  amount: number;
  createdAt?: Date;
  /** Hasta cuando se puede deshacer. */
  undoableUntil: Date;
}

export interface LoyaltyActionResult {
  member: StaffLoyaltyMember;
  event: PublicLoyaltyEvent;
  /** Este sello completo la tarjeta: la caja lo muestra en grande. */
  rewardReached: boolean;
}

/** Lo que pasa en la caja: buscar, sumar sellos, canjear, corregir y deshacer. */
@Injectable()
export class LoyaltyMembersService {
  private readonly logger = new Logger(LoyaltyMembersService.name);

  constructor(
    private readonly membersRepository: LoyaltyMembersRepository,
    private readonly eventsRepository: LoyaltyEventsRepository,
    private readonly programsService: LoyaltyProgramsService,
    private readonly cardMailer: LoyaltyCardMailer,
    private readonly crypto: CryptoService,
  ) {}

  async search(business: Business, programUrn: string, query: DTO.ListMembers): Promise<Paginated<StaffLoyaltyMember>> {
    const { program } = await this.programsService.getOwned(business.urn, programUrn);
    const page = query.page ?? 0;
    const limit = query.limit ?? DTO.LOYALTY_MEMBERS_DEFAULT_PAGE_SIZE;

    const { items, total } = await this.membersRepository.search(business.urn, program.urn, {
      search: query.search,
      page,
      limit,
    });

    return paginate(
      items.map((member) => this.toStaff(member, program)),
      page,
      limit,
      total,
    );
  }

  /** Lo que lee la caja al escanear: a nivel negocio, para poder decir de que sucursal es la tarjeta. */
  async findByCode(business: Business, memberCode: string): Promise<StaffLoyaltyMemberDetail> {
    const member = await this.getByCode(business.urn, memberCode);
    const owned = await this.programsService.getOwned(business.urn, member.programUrn);

    return {
      ...this.toStaff(member, owned.program),
      program: {
        urn: owned.program.urn,
        locationUrn: owned.program.locationUrn,
        locationTitle: owned.location?.title ?? '',
      },
    };
  }

  async stamp(
    business: Business,
    user: AuthenticatedUser,
    programUrn: string,
    memberCode: string,
  ): Promise<LoyaltyActionResult> {
    const owned = await this.operableProgram(business, programUrn);
    const { program } = owned;
    const member = await this.getInProgram(business.urn, program, memberCode);

    const now = new Date();
    const lastStampBefore = new Date(now.getTime() - program.stampCooldownMinutes * MINUTE_MS);
    const updated = await this.membersRepository.addStamp(
      business.urn,
      program.urn,
      member.memberCode,
      now,
      lastStampBefore,
    );
    if (!updated) {
      return Exceptions.conflict(Errors.LOYALTY_STAMP_COOLDOWN);
    }

    const event = await this.recordEvent(business, user, owned, updated, LoyaltyEventType.STAMP, 1);
    await this.programsService.increment(business.urn, program.urn, { stamps: 1 });

    const rewardReached = updated.stamps - 1 < program.stampsRequired && updated.stamps >= program.stampsRequired;
    if (rewardReached) {
      await this.cardMailer.send('reward', { business, program, location: owned.location, member: updated });
    }

    return { member: this.toStaff(updated, program), event, rewardReached };
  }

  /** Descuenta los sellos del premio; lo que sobra queda en la tarjeta. */
  async redeem(
    business: Business,
    user: AuthenticatedUser,
    programUrn: string,
    memberCode: string,
  ): Promise<LoyaltyActionResult> {
    const owned = await this.operableProgram(business, programUrn);
    const { program } = owned;
    const member = await this.getInProgram(business.urn, program, memberCode);

    const updated = await this.membersRepository.redeem(
      business.urn,
      program.urn,
      member.memberCode,
      program.stampsRequired,
    );
    if (!updated) {
      return Exceptions.conflict(Errors.LOYALTY_NOT_ENOUGH_STAMPS);
    }

    const event = await this.recordEvent(
      business,
      user,
      owned,
      updated,
      LoyaltyEventType.REDEMPTION,
      program.stampsRequired,
    );
    await this.programsService.increment(business.urn, program.urn, { redemptions: 1 });

    return { member: this.toStaff(updated, program), event, rewardReached: false };
  }

  /**
   * Correccion del ADMIN (solo ese rol): saca sellos mal puestos cuando ya no se puede deshacer el sello
   * (paso la ventana o la caja ya cerro la tarjeta). Queda en el historial y se puede deshacer como
   * cualquier otra accion. Anda aunque el programa este pausado: corregir no es operar la caja.
   */
  async removeStamps(
    business: Business,
    user: AuthenticatedUser,
    programUrn: string,
    memberCode: string,
    { stamps }: DTO.RemoveStamps,
  ): Promise<LoyaltyActionResult> {
    const owned = await this.programsService.getOwned(business.urn, programUrn);
    const { program } = owned;
    const member = await this.getInProgram(business.urn, program, memberCode);

    const updated = await this.membersRepository.removeStamps(business.urn, program.urn, member.memberCode, stamps);
    if (!updated) {
      return Exceptions.conflict(Errors.LOYALTY_REMOVE_EXCEEDS_STAMPS);
    }

    const event = await this.recordEvent(business, user, owned, updated, LoyaltyEventType.STAMP_REMOVAL, stamps);
    await this.programsService.increment(business.urn, program.urn, { stamps: -stamps });

    return { member: this.toStaff(updated, program), event, rewardReached: false };
  }

  /**
   * Deshace la ultima accion de una tarjeta, dentro de la ventana. Solo la ultima: deshacer un sello
   * viejo despues de un canje dejaria el saldo sin sentido.
   */
  async undo(
    business: Business,
    user: AuthenticatedUser,
    membership: BusinessMember,
    eventUrn: string,
  ): Promise<StaffLoyaltyMember> {
    if (!Urn.isValid(eventUrn, LOYALTY_EVENT_ENTITY)) {
      return Exceptions.notFound(Errors.NOT_FOUND);
    }

    const event = await this.eventsRepository.findForBusiness(business.urn, eventUrn);
    if (!event) {
      return Exceptions.notFound(Errors.NOT_FOUND);
    }

    const now = new Date();
    const latest = await this.eventsRepository.latestActiveForMember(business.urn, event.memberUrn);
    const expired = (event.createdAt?.getTime() ?? 0) + config.UndoWindowMs < now.getTime();
    if (event.undoneAt || expired || latest?.urn !== event.urn) {
      return Exceptions.conflict(Errors.LOYALTY_UNDO_NOT_ALLOWED);
    }
    // Si un cajero pudiera deshacer la correccion, devolveria los sellos que saco el dueño.
    if (event.type === LoyaltyEventType.STAMP_REMOVAL && !CORRECTION_ROLES.includes(membership.role)) {
      return Exceptions.forbidden(Errors.FORBIDDEN);
    }

    // Primero se marca el evento: si dos cajas deshacen a la vez, solo una llega a revertir el saldo.
    if (!(await this.eventsRepository.markUndone(business.urn, event.urn, user.urn, now))) {
      return Exceptions.conflict(Errors.LOYALTY_UNDO_NOT_ALLOWED);
    }

    const reverted = await this.revert(business.urn, event);
    if (!reverted) {
      // El cliente borro sus datos en el medio: no hay saldo que revertir.
      return Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND);
    }

    await this.programsService.increment(business.urn, event.programUrn, STATS_REVERSAL[event.type](event.amount));

    const { program } = await this.programsService.getOwned(business.urn, event.programUrn);
    return this.toStaff(reverted, program);
  }

  /**
   * El link actual de la tarjeta, sin cambiarlo: para mandarlo por WhatsApp desde la caja o
   * mostrarlo como QR. Quien esta en la caja ya ve la tarjeta entera; esto no le da mas que eso.
   */
  async currentCardLink(business: Business, memberCode: string): Promise<{ cardUrl: string; pngDataUrl: string }> {
    const member = await this.getByCode(business.urn, memberCode);
    const cardUrl = config.CardUrl(this.crypto.decrypt(member.cardToken));

    return { cardUrl, pngDataUrl: await renderQr(cardUrl) };
  }

  /**
   * Link nuevo para la tarjeta, para mostrarlo como QR en la caja: es la recuperacion cuando el
   * cliente no dejo email o perdio el link. El link anterior deja de andar.
   */
  async regenerateCardLink(business: Business, memberCode: string): Promise<{ cardUrl: string; pngDataUrl: string }> {
    const member = await this.getByCode(business.urn, memberCode);
    const token = generateCardToken();

    await this.membersRepository.rotateToken(
      business.urn,
      member.urn,
      hashCardToken(token),
      this.crypto.encrypt(token),
    );

    const cardUrl = config.CardUrl(token);
    return { cardUrl, pngDataUrl: await renderQr(cardUrl) };
  }

  async remove(business: Business, memberCode: string): Promise<void> {
    const member = await this.getByCode(business.urn, memberCode);
    if (await this.membersRepository.deleteForBusiness(business.urn, member.urn)) {
      await this.programsService.increment(business.urn, member.programUrn, { members: -1 });
    }
  }

  private revert(businessUrn: string, event: LoyaltyEvent): Promise<LoyaltyMember | null> {
    switch (event.type) {
      case LoyaltyEventType.STAMP:
        return this.membersRepository.undoStamp(businessUrn, event.memberUrn);
      case LoyaltyEventType.REDEMPTION:
        return this.membersRepository.undoRedemption(businessUrn, event.memberUrn, event.amount);
      case LoyaltyEventType.STAMP_REMOVAL:
        return this.membersRepository.undoStampRemoval(businessUrn, event.memberUrn, event.amount);
    }
  }

  private async operableProgram(business: Business, programUrn: string): Promise<OwnedProgram> {
    const owned = await this.programsService.getOwned(business.urn, programUrn);
    if (!isOperable(owned)) {
      return Exceptions.conflict(Errors.LOYALTY_PROGRAM_PAUSED);
    }
    return owned;
  }

  private async getByCode(businessUrn: string, memberCode: string): Promise<LoyaltyMember> {
    const code = memberCode.toUpperCase();
    if (!MEMBER_CODE_PATTERN.test(code)) {
      return Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND);
    }

    const member = await this.membersRepository.findByCode(businessUrn, code);
    if (!member) {
      return Exceptions.notFound(Errors.LOYALTY_MEMBER_NOT_FOUND);
    }
    return member;
  }

  /** La tarjeta tiene que ser de este programa: una de otra sucursal no suma ni canjea aca. */
  private async getInProgram(businessUrn: string, program: LoyaltyProgram, memberCode: string): Promise<LoyaltyMember> {
    const member = await this.getByCode(businessUrn, memberCode);
    if (member.programUrn !== program.urn) {
      return Exceptions.conflict(Errors.LOYALTY_WRONG_LOCATION);
    }
    return member;
  }

  private async recordEvent(
    business: Business,
    user: AuthenticatedUser,
    { program }: OwnedProgram,
    member: LoyaltyMember,
    type: LoyaltyEventType,
    amount: number,
  ): Promise<PublicLoyaltyEvent> {
    // El saldo de verdad es el del miembro, que ya se actualizo. Si el historial falla, se avisa en
    // el log y la caja sigue: lo unico que se pierde es poder deshacer esta accion.
    let event: LoyaltyEvent | null = null;
    try {
      event = await this.eventsRepository.record({
        businessUrn: business.urn,
        programUrn: program.urn,
        locationUrn: program.locationUrn,
        memberUrn: member.urn,
        type,
        amount,
        byUserUrn: user.urn,
      });
    } catch (error) {
      this.logger.error(`No se pudo registrar el evento ${type} de la tarjeta ${member.urn}: ${String(error)}`);
    }

    const createdAt = event?.createdAt ?? new Date();
    return {
      urn: event?.urn ?? '',
      type,
      amount,
      createdAt,
      undoableUntil: new Date(createdAt.getTime() + config.UndoWindowMs),
    };
  }

  private toStaff(member: LoyaltyMember, program: LoyaltyProgram): StaffLoyaltyMember {
    return toStaffMember(member, program);
  }
}

/** El cliente como lo ve el local (la caja, la lista y los recordatorios). */
export function toStaffMember(member: LoyaltyMember, program: LoyaltyProgram): StaffLoyaltyMember {
  return {
    urn: member.urn,
    memberCode: member.memberCode,
    programUrn: member.programUrn,
    name: member.name,
    phone: member.phone,
    email: member.email ?? null,
    stamps: member.stamps,
    stampsRequired: program.stampsRequired,
    rewardAvailable: member.stamps >= program.stampsRequired,
    totalStamps: member.totalStamps,
    totalRedemptions: member.totalRedemptions,
    lastStampAt: member.lastStampAt ?? null,
    nextStampAt: member.lastStampAt
      ? new Date(member.lastStampAt.getTime() + program.stampCooldownMinutes * MINUTE_MS)
      : null,
    lastReminderAt: member.lastReminderAt ?? null,
    remindersOptOutBy: member.remindersOptOut?.by ?? null,
    marketing: member.consent.marketing,
    createdAt: member.createdAt,
  };
}
