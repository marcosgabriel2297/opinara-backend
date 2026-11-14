import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { EncryptedValue } from '@shared/common/crypto';
import { DatabaseRepository } from '@shared/repositories';
import { escapeRegex } from '@shared/utils';

import { LoyaltyMember, RemindersOptOut } from './loyalty-member.model';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LoyaltyMembersRepository extends DatabaseRepository<LoyaltyMember> {
  constructor(@InjectModel(LoyaltyMember.name) model: Model<LoyaltyMember>) {
    super(model);
  }

  /**
   * La unica busqueda sin `businessUrn`: la hace la tarjeta publica, que solo tiene el token. El
   * hash es unico y no adivinable (32 bytes aleatorios), igual que el de las invitaciones.
   */
  findByTokenHash(cardTokenHash: string): Promise<LoyaltyMember | null> {
    return this.findOne({ cardTokenHash });
  }

  findByCode(businessUrn: string, memberCode: string): Promise<LoyaltyMember | null> {
    return this.findOne({ businessUrn, memberCode: memberCode.toUpperCase() });
  }

  findByPhone(businessUrn: string, programUrn: string, phone: string): Promise<LoyaltyMember | null> {
    return this.findOne({ businessUrn, programUrn, phone });
  }

  /**
   * Busqueda de la caja: con 3 o mas digitos, por el final del celular ("los ultimos 4"); si no, por
   * nombre. Y si parece un codigo de tarjeta (6 caracteres), tambien por codigo exacto: un nombre como
   * "ANDREA" se busca de las dos formas.
   */
  async search(
    businessUrn: string,
    programUrn: string,
    query: { search?: string; page: number; limit: number },
  ): Promise<{ items: LoyaltyMember[]; total: number }> {
    const filter: FilterQuery<LoyaltyMember> = { businessUrn, programUrn };
    const search = query.search?.trim();

    if (search) {
      const digits = search.replace(/\D/g, '');
      const code = search.toUpperCase().replace(/[\s-]/g, '');
      filter.$or = [
        digits.length >= 3 ? { phone: new RegExp(`${digits}$`) } : { name: new RegExp(escapeRegex(search), 'i') },
        ...(/^[A-Z0-9]{6}$/.test(code) ? [{ memberCode: code }] : []),
      ];
    }

    const [items, total] = await Promise.all([
      this.find(filter, { page: query.page, limit: query.limit, sort: { name: 'asc' } }),
      this.count(filter),
    ]);

    return { items, total };
  }

  /**
   * Suma un sello solo si paso el tiempo minimo desde el anterior. La condicion va en el filtro:
   * dos toques seguidos o dos cajas a la vez son una sola operacion atomica sobre el documento,
   * y la segunda no matchea.
   */
  addStamp(
    businessUrn: string,
    programUrn: string,
    memberCode: string,
    now: Date,
    lastStampBefore: Date,
  ): Promise<LoyaltyMember | null> {
    return this.updateOne(
      {
        businessUrn,
        programUrn,
        memberCode,
        $or: [{ lastStampAt: null }, { lastStampAt: { $lte: lastStampBefore } }],
      },
      { $inc: { stamps: 1, totalStamps: 1 }, $set: { lastStampAt: now } },
    );
  }

  /** Descuenta los sellos del premio solo si alcanzan: un canje doble no deja el saldo negativo. */
  redeem(businessUrn: string, programUrn: string, memberCode: string, stamps: number): Promise<LoyaltyMember | null> {
    return this.updateOne(
      { businessUrn, programUrn, memberCode, stamps: { $gte: stamps } },
      { $inc: { stamps: -stamps, totalRedemptions: 1 } },
    );
  }

  /** Revierte un sello: el saldo nunca queda negativo y el proximo sello no espera el tiempo minimo. */
  undoStamp(businessUrn: string, urn: string): Promise<LoyaltyMember | null> {
    return this.updateOne(
      { businessUrn, urn, stamps: { $gte: 1 } },
      { $inc: { stamps: -1, totalStamps: -1 }, $set: { lastStampAt: null } },
    );
  }

  undoRedemption(businessUrn: string, urn: string, stamps: number): Promise<LoyaltyMember | null> {
    return this.updateOne({ businessUrn, urn }, { $inc: { stamps, totalRedemptions: -1 } });
  }

  /**
   * Saca sellos mal puestos, solo si los tiene: el saldo nunca queda negativo. Es una correccion,
   * asi que tambien baja el historico.
   */
  removeStamps(
    businessUrn: string,
    programUrn: string,
    memberCode: string,
    stamps: number,
  ): Promise<LoyaltyMember | null> {
    return this.updateOne(
      { businessUrn, programUrn, memberCode, stamps: { $gte: stamps } },
      { $inc: { stamps: -stamps, totalStamps: -stamps } },
    );
  }

  undoStampRemoval(businessUrn: string, urn: string, stamps: number): Promise<LoyaltyMember | null> {
    return this.updateOne({ businessUrn, urn }, { $inc: { stamps, totalStamps: stamps } });
  }

  /**
   * A quienes se recomienda recordarles (ver `config.Reminders`), con dos motivos:
   *
   * - **Cerca del premio**: les faltan entre 1 y `maxMissing` sellos y su ultimo sello fue antes de
   *   `today` (fecha `YYYY-MM-DD` en `timezone`: al cliente que esta en la caja no se le escribe).
   * - **No viene**: les faltan mas (o tienen 0) y su ultima visita (el ultimo sello o, si no tiene,
   *   el alta) fue hace `inactiveDays` dias o mas.
   *
   * En los dos casos: no pidieron dejar de recibirlos y no se les mando uno desde esa ultima visita
   * (uno por vuelta, sumando los dos motivos). Los que esperan hace mas, primero.
   */
  async reminderCandidates(
    businessUrn: string,
    programs: { urn: string; stampsRequired: number; inactiveDays: number }[],
    options: {
      maxMissing: number;
      today: string;
      timezone: string;
      now: Date;
      reasons: { nearReward: boolean; inactive: boolean };
      page: number;
      limit: number;
    },
  ): Promise<{ items: LoyaltyMember[]; total: number }> {
    const lastVisit = { $ifNull: ['$lastStampAt', '$createdAt'] };
    const branches: FilterQuery<LoyaltyMember>[] = programs.flatMap((program) => {
      const nearFrom = Math.max(1, program.stampsRequired - options.maxMissing);
      return [
        ...(options.reasons.nearReward
          ? [
              {
                programUrn: program.urn,
                stamps: { $gte: nearFrom, $lt: program.stampsRequired },
                lastStampAt: { $ne: null },
                $expr: {
                  $lt: [
                    { $dateToString: { format: '%Y-%m-%d', date: '$lastStampAt', timezone: options.timezone } },
                    options.today,
                  ],
                },
              },
            ]
          : []),
        ...(options.reasons.inactive
          ? [
              {
                programUrn: program.urn,
                stamps: { $lt: nearFrom },
                $expr: {
                  $lte: [lastVisit, new Date(options.now.getTime() - program.inactiveDays * DAY_MS)],
                },
              },
            ]
          : []),
      ];
    });
    if (branches.length === 0) return { items: [], total: 0 };

    const filter: FilterQuery<LoyaltyMember> = {
      businessUrn,
      // `null` tambien matchea a los que no tienen el campo.
      remindersOptOut: null,
      $or: branches,
      // Sin recordatorio (`null` o sin el campo, que en $expr ordenan antes que cualquier fecha) o
      // con uno anterior a su ultima visita.
      $expr: { $lt: ['$lastReminderAt', lastVisit] },
    };

    const [items, total] = await Promise.all([
      this.find(filter, { page: options.page, limit: options.limit, sort: { lastStampAt: 'asc', createdAt: 'asc' } }),
      this.count(filter),
    ]);
    return { items, total };
  }

  markReminded(businessUrn: string, urn: string, now: Date, byUserUrn: string): Promise<LoyaltyMember | null> {
    return this.updateOne(
      { businessUrn, urn, remindersOptOut: null },
      { $set: { lastReminderAt: now, lastReminderByUserUrn: byUserUrn } },
    );
  }

  /** `null` vuelve a permitir los recordatorios. */
  setRemindersOptOut(businessUrn: string, urn: string, optOut: RemindersOptOut | null): Promise<LoyaltyMember | null> {
    return this.updateOne({ businessUrn, urn }, { $set: { remindersOptOut: optOut } });
  }

  rotateToken(
    businessUrn: string,
    urn: string,
    cardTokenHash: string,
    cardToken: EncryptedValue,
  ): Promise<LoyaltyMember | null> {
    return this.updateOne({ businessUrn, urn }, { $set: { cardTokenHash, cardToken } });
  }

  async deleteForBusiness(businessUrn: string, urn: string): Promise<boolean> {
    const result = await this.model.deleteOne({ businessUrn, urn }).exec();
    return result.deletedCount > 0;
  }
}
