import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import { Business } from '@shared/models/business';
import { isDuplicateKeyError, slugify } from '@shared/utils';
import { Location, LocationsRepository } from '@packages/locations';

import config from '../config';
import * as DTO from '../dtos';
import {
  LOYALTY_PROGRAM_ENTITY,
  LoyaltyProgram,
  LoyaltyProgramStats,
  LoyaltyProgramStatus,
  LoyaltyProgramsRepository,
} from '../models';

export interface PublicLoyaltyProgram {
  urn: string;
  location: { urn: string; title: string; isActive: boolean };
  slug: string;
  status: LoyaltyProgramStatus;
  stampsRequired: number;
  rewardDescription: string;
  terms: string | null;
  stampCooldownMinutes: number;
  /** La plantilla del recordatorio que se usa: la propia o, si no escribio una, la recomendada. */
  reminderMessage: string;
  /** `true` mientras usa el texto recomendado. */
  reminderMessageIsDefault: boolean;
  /** Dias sin venir para el "te extrañamos". */
  inactiveDays: number;
  inactiveReminderMessage: string;
  inactiveReminderMessageIsDefault: boolean;
  stats: LoyaltyProgramStats;
  /** Lo que se imprime en el QR de alta de la sucursal. */
  signupUrl: string;
  createdAt?: Date;
}

export interface GeneratedQr {
  targetUrl: string;
  /** PNG en base64 listo para mostrar o descargar. */
  pngDataUrl: string;
}

/** El PNG de un QR, con los mismos parametros en todo el paquete. */
export const renderQr = (content: string): Promise<string> =>
  toDataURL(content, {
    errorCorrectionLevel: config.Qr.ErrorCorrectionLevel,
    width: config.Qr.Width,
    margin: config.Qr.Margin,
  });

/** Un programa con su sucursal, ya validado como del negocio. */
export interface OwnedProgram {
  program: LoyaltyProgram;
  location: Location | null;
}

/** Configuracion de los programas, uno por sucursal. */
@Injectable()
export class LoyaltyProgramsService {
  constructor(
    private readonly programsRepository: LoyaltyProgramsRepository,
    private readonly locationsRepository: LocationsRepository,
  ) {}

  async findAll(business: Business): Promise<PublicLoyaltyProgram[]> {
    const owned = await this.findAllOwned(business.urn);
    return owned.map(({ program, location }) => this.toPublic(business, program, location));
  }

  async findOne(business: Business, urn: string): Promise<PublicLoyaltyProgram> {
    const { program, location } = await this.getOwned(business.urn, urn);
    return this.toPublic(business, program, location);
  }

  async create(business: Business, user: AuthenticatedUser, payload: DTO.CreateProgram): Promise<PublicLoyaltyProgram> {
    const location = await this.locationsRepository.findForBusiness(business.urn, payload.locationUrn);
    if (!location || !location.isActive) {
      return Exceptions.notFound(Errors.LOCATION_NOT_FOUND);
    }

    if (await this.programsRepository.findByLocation(business.urn, location.urn)) {
      Exceptions.conflict(Errors.LOYALTY_PROGRAM_ALREADY_EXISTS);
    }

    const slug = slugify(payload.slug ?? location.title);
    if (slug.length < 2) {
      Exceptions.badRequest(Errors.SLUG_NOT_DERIVABLE);
    }

    if (await this.programsRepository.findBySlug(business.urn, slug)) {
      Exceptions.conflict(Errors.LOYALTY_PROGRAM_SLUG_ALREADY_EXISTS);
    }

    try {
      const program = await this.programsRepository.createOrUpdate({
        urn: Urn.createUUID(LOYALTY_PROGRAM_ENTITY),
        businessUrn: business.urn,
        locationUrn: location.urn,
        slug,
        status: LoyaltyProgramStatus.ACTIVE,
        stampsRequired: payload.stampsRequired ?? config.Program.DefaultStampsRequired,
        rewardDescription: payload.rewardDescription,
        terms: payload.terms || undefined,
        stampCooldownMinutes: payload.stampCooldownMinutes ?? config.Program.DefaultStampCooldownMinutes,
        stats: { members: 0, stamps: 0, redemptions: 0 },
        createdByUserUrn: user.urn,
      });

      return this.toPublic(business, program, location);
    } catch (error) {
      // Dos altas a la vez: el indice unico decide cual de los dos conflictos fue.
      if (isDuplicateKeyError(error)) {
        const sameLocation = await this.programsRepository.findByLocation(business.urn, location.urn);
        Exceptions.conflict(
          sameLocation ? Errors.LOYALTY_PROGRAM_ALREADY_EXISTS : Errors.LOYALTY_PROGRAM_SLUG_ALREADY_EXISTS,
        );
      }

      throw error;
    }
  }

  /**
   * Cambia el premio, los sellos, las condiciones, el tiempo minimo, el recordatorio o pausa el programa. Cambiar
   * `stampsRequired` rige para todas las tarjetas, tambien las que ya tienen sellos.
   */
  async update(business: Business, urn: string, payload: DTO.UpdateProgram): Promise<PublicLoyaltyProgram> {
    const { program, location } = await this.getOwned(business.urn, urn);

    const set: Partial<LoyaltyProgram> = {};
    const unset: Record<string, ''> = {};
    if (payload.status !== undefined) set.status = payload.status;
    if (payload.rewardDescription !== undefined) set.rewardDescription = payload.rewardDescription;
    if (payload.stampsRequired !== undefined) set.stampsRequired = payload.stampsRequired;
    if (payload.stampCooldownMinutes !== undefined) set.stampCooldownMinutes = payload.stampCooldownMinutes;
    if (payload.terms !== undefined) {
      if (payload.terms === '') unset.terms = '';
      else set.terms = payload.terms;
    }
    // Vacio, o igual al recomendado, vuelve al recomendado: asi le llegan las mejoras que le hagamos.
    for (const [field, recommended] of [
      ['reminderMessage', config.Reminders.DefaultMessage],
      ['inactiveReminderMessage', config.Reminders.DefaultInactiveMessage],
    ] as const) {
      const value = payload[field];
      if (value === undefined) continue;
      if (value === '' || value === recommended) unset[field] = '';
      else set[field] = value;
    }
    if (payload.inactiveDays !== undefined) set.inactiveDays = payload.inactiveDays;

    const updated = await this.programsRepository.updateOne(
      { businessUrn: business.urn, urn: program.urn },
      { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
    );

    return this.toPublic(business, updated ?? program, location);
  }

  /** El QR del alta, para imprimir. Se arma a demanda: lo unico que codifica es la URL. */
  async generateQr(business: Business, urn: string): Promise<GeneratedQr> {
    const { program } = await this.getOwned(business.urn, urn);
    const targetUrl = config.SignupUrl(business.slug, program.slug);

    return { targetUrl, pngDataUrl: await renderQr(targetUrl) };
  }

  /** Todos los programas del negocio, cada uno con su sucursal. */
  async findAllOwned(businessUrn: string): Promise<OwnedProgram[]> {
    const [programs, locations] = await Promise.all([
      this.programsRepository.findAllForBusiness(businessUrn),
      this.locationsRepository.findAllForBusiness(businessUrn),
    ]);
    const byUrn = new Map(locations.map((location) => [location.urn, location]));

    return programs.map((program) => ({ program, location: byUrn.get(program.locationUrn) ?? null }));
  }

  async getOwned(businessUrn: string, urn: string): Promise<OwnedProgram> {
    if (!Urn.isValid(urn, LOYALTY_PROGRAM_ENTITY)) {
      return Exceptions.notFound(Errors.LOYALTY_PROGRAM_NOT_FOUND);
    }

    const program = await this.programsRepository.findForBusiness(businessUrn, urn);
    if (!program) {
      return Exceptions.notFound(Errors.LOYALTY_PROGRAM_NOT_FOUND);
    }

    const location = await this.locationsRepository.findForBusiness(businessUrn, program.locationUrn);
    return { program, location };
  }

  increment(
    businessUrn: string,
    urn: string,
    counters: Partial<Record<keyof LoyaltyProgramStats, number>>,
  ): Promise<void> {
    return this.programsRepository.increment(businessUrn, urn, counters);
  }

  toPublic(business: Business, program: LoyaltyProgram, location: Location | null): PublicLoyaltyProgram {
    return {
      urn: program.urn,
      location: {
        urn: program.locationUrn,
        title: location?.title ?? '',
        isActive: location?.isActive ?? false,
      },
      slug: program.slug,
      status: program.status,
      stampsRequired: program.stampsRequired,
      rewardDescription: program.rewardDescription,
      terms: program.terms ?? null,
      stampCooldownMinutes: program.stampCooldownMinutes,
      reminderMessage: program.reminderMessage ?? config.Reminders.DefaultMessage,
      reminderMessageIsDefault: !program.reminderMessage,
      inactiveDays: program.inactiveDays ?? config.Reminders.DefaultInactiveDays,
      inactiveReminderMessage: program.inactiveReminderMessage ?? config.Reminders.DefaultInactiveMessage,
      inactiveReminderMessageIsDefault: !program.inactiveReminderMessage,
      stats: program.stats,
      signupUrl: config.SignupUrl(business.slug, program.slug),
      createdAt: program.createdAt,
    };
  }
}

/**
 * Si el programa admite altas y sellos ahora: activo y con la sucursal activa. El plan y el estado
 * del negocio los chequea el guard (en la caja) o el servicio publico.
 */
export const isOperable = ({ program, location }: OwnedProgram): boolean =>
  program.status === LoyaltyProgramStatus.ACTIVE && location?.isActive === true;
