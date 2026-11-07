import { Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '@shared/common/crypto';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Urn } from '@shared/common/urn';
import { Business, BusinessesRepository } from '@shared/models/business';
import { BusinessStatus } from '@shared/models/enums/business';
import { Feature, hasFeature } from '@shared/models/enums/plan';
import { isDuplicateKeyError } from '@shared/utils';
import { LocationsRepository } from '@packages/locations';

import config from '../config';
import * as DTO from '../dtos';
import { LOYALTY_MEMBER_ENTITY, LoyaltyMember, LoyaltyMembersRepository, LoyaltyProgramsRepository } from '../models';
import { CARD_TOKEN_PATTERN, generateCardToken, generateMemberCode, hashCardToken, normalizePhone } from '../utils';
import { LoyaltyCardMailer } from './loyalty-card-mailer.service';
import { OwnedProgram, isOperable, renderQr } from './loyalty-programs.service';

/** Lo que ve el cliente antes de darse de alta. Sin identificadores internos. */
export interface PublicLoyaltySignup {
  business: { name: string; slug: string; logoUpdatedAt: Date | null };
  location: { title: string };
  program: { rewardDescription: string; stampsRequired: number; terms: string | null };
  termsVersion: string;
}

/** La tarjeta, para quien tiene el link. */
export interface PublicLoyaltyCard {
  business: { name: string; slug: string; logoUpdatedAt: Date | null };
  location: { title: string };
  program: {
    rewardDescription: string;
    stampsRequired: number;
    terms: string | null;
    /** Si se pueden sumar sellos ahora. Pausado (o fuera del plan), la tarjeta se ve igual. */
    active: boolean;
  };
  member: {
    name: string;
    phone: string;
    email: string | null;
    /** Lo que lee la caja (tambien se puede dictar). */
    memberCode: string;
    /** El QR que se muestra en la caja (`opinara-card:{memberCode}`), como PNG en base64. */
    qrPngDataUrl: string;
    stamps: number;
    rewardAvailable: boolean;
    totalRedemptions: number;
    createdAt?: Date;
  };
}

interface ResolvedProgram extends OwnedProgram {
  business: Business;
}

const MEMBER_CODE_ATTEMPTS = 5;

/**
 * La parte sin sesion: el formulario de alta, la tarjeta y el borrado de datos.
 *
 * No se cruza con las reseñas en ningun punto: ni sellos por reseñar ni links a Google.
 */
@Injectable()
export class PublicLoyaltyService {
  private readonly logger = new Logger(PublicLoyaltyService.name);

  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly programsRepository: LoyaltyProgramsRepository,
    private readonly membersRepository: LoyaltyMembersRepository,
    private readonly locationsRepository: LocationsRepository,
    private readonly cardMailer: LoyaltyCardMailer,
    private readonly crypto: CryptoService,
  ) {}

  async signup(params: DTO.ProgramParams): Promise<PublicLoyaltySignup> {
    const { business, program, location } = await this.resolveOpen(params);

    return {
      business: this.publicBusiness(business),
      location: { title: location?.title ?? '' },
      program: {
        rewardDescription: program.rewardDescription,
        stampsRequired: program.stampsRequired,
        terms: program.terms ?? null,
      },
      termsVersion: config.TermsVersion,
    };
  }

  /**
   * Alta del cliente. Devuelve el token del link **una sola vez**: despues solo se puede reenviar
   * por mail o generar uno nuevo desde la caja.
   *
   * Si el celular ya tiene tarjeta en este programa, no se la devuelve: quien sepa un numero ajeno
   * podria quedarse con la tarjeta y canjear el premio. Se le reenvia el link al email, si tiene.
   */
  async register(params: DTO.ProgramParams, payload: DTO.Register): Promise<{ cardToken: string }> {
    const resolved = await this.resolveOpen(params);

    // Un bot completo el campo escondido: se le contesta como a cualquiera, sin crear nada.
    // Se avisa en el log (sin datos personales): si el campo lo llena otra cosa que un bot —un
    // autocompletado del navegador—, una persona real se queda sin tarjeta y hay que poder verlo.
    if (payload.website) {
      this.logger.warn(`Alta descartada por el campo trampa en ${params.businessSlug}/${params.programSlug}`);
      return { cardToken: generateCardToken() };
    }

    const phone = normalizePhone(payload.phone);
    if (!phone) {
      return Exceptions.badRequest(Errors.LOYALTY_INVALID_PHONE);
    }

    const existing = await this.membersRepository.findByPhone(resolved.business.urn, resolved.program.urn, phone);
    if (existing) {
      return this.alreadyRegistered(resolved, existing);
    }

    const cardToken = generateCardToken();
    for (let attempt = 1; attempt <= MEMBER_CODE_ATTEMPTS; attempt += 1) {
      try {
        const member = await this.membersRepository.createOrUpdate({
          urn: Urn.createUUID(LOYALTY_MEMBER_ENTITY),
          businessUrn: resolved.business.urn,
          programUrn: resolved.program.urn,
          memberCode: generateMemberCode(),
          name: payload.name,
          phone,
          email: payload.email?.toLowerCase(),
          cardTokenHash: hashCardToken(cardToken),
          cardToken: this.crypto.encrypt(cardToken),
          stamps: 0,
          totalStamps: 0,
          totalRedemptions: 0,
          lastStampAt: null,
          consent: { acceptedAt: new Date(), termsVersion: config.TermsVersion, marketing: payload.marketing === true },
        });

        await this.programsRepository.increment(resolved.business.urn, resolved.program.urn, { members: 1 });
        await this.cardMailer.send('welcome', { ...resolved, member }, cardToken);

        return { cardToken };
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;

        // Dos altas del mismo celular a la vez, o (muy raro) un codigo de caja repetido: se reintenta.
        const raced = await this.membersRepository.findByPhone(resolved.business.urn, resolved.program.urn, phone);
        if (raced) {
          return this.alreadyRegistered(resolved, raced);
        }
      }
    }

    return Exceptions.internal();
  }

  async card(token: string | undefined): Promise<PublicLoyaltyCard> {
    const member = await this.memberByToken(token);

    const [program, business] = await Promise.all([
      this.programsRepository.findForBusiness(member.businessUrn, member.programUrn),
      this.businessesRepository.one(member.businessUrn),
    ]);
    if (!program || !business) {
      return Exceptions.notFound(Errors.LOYALTY_CARD_NOT_FOUND);
    }
    const location = await this.locationsRepository.findForBusiness(business.urn, program.locationUrn);

    return {
      business: this.publicBusiness(business),
      location: { title: location?.title ?? '' },
      program: {
        rewardDescription: program.rewardDescription,
        stampsRequired: program.stampsRequired,
        terms: program.terms ?? null,
        active: this.isOpen({ business, program, location }),
      },
      member: {
        name: member.name,
        phone: member.phone,
        email: member.email ?? null,
        memberCode: member.memberCode,
        qrPngDataUrl: await renderQr(config.CardQrContent(member.memberCode)),
        stamps: member.stamps,
        rewardAvailable: member.stamps >= program.stampsRequired,
        totalRedemptions: member.totalRedemptions,
        createdAt: member.createdAt,
      },
    };
  }

  /**
   * Reenvia el link al email de la tarjeta. Responde igual exista o no, para no confirmar que un
   * celular esta registrado.
   */
  async resend(payload: DTO.ResendCard): Promise<void> {
    const phone = normalizePhone(payload.phone);
    if (!phone) return;

    const resolved = await this.resolve(payload);
    if (!resolved) return;

    const member = await this.membersRepository.findByPhone(resolved.business.urn, resolved.program.urn, phone);
    if (member) {
      await this.cardMailer.send('link', { ...resolved, member });
    }
  }

  /** El cliente borra sus datos desde la tarjeta. Los eventos quedan, sin datos personales. */
  async deleteCard(token: string | undefined): Promise<void> {
    const member = await this.memberByToken(token);

    if (await this.membersRepository.deleteForBusiness(member.businessUrn, member.urn)) {
      await this.programsRepository.increment(member.businessUrn, member.programUrn, { members: -1 });
    }
  }

  private async alreadyRegistered(resolved: ResolvedProgram, member: LoyaltyMember): Promise<never> {
    await this.cardMailer.send('link', { ...resolved, member });
    return Exceptions.conflict(Errors.LOYALTY_ALREADY_REGISTERED);
  }

  private async memberByToken(token: string | undefined): Promise<LoyaltyMember> {
    if (typeof token !== 'string' || !CARD_TOKEN_PATTERN.test(token)) {
      return Exceptions.notFound(Errors.LOYALTY_CARD_NOT_FOUND);
    }

    const member = await this.membersRepository.findByTokenHash(hashCardToken(token));
    if (!member) {
      return Exceptions.notFound(Errors.LOYALTY_CARD_NOT_FOUND);
    }
    return member;
  }

  /** Un programa que admite altas. Cualquier otro caso da el mismo 404, para no revelar cual fue. */
  private async resolveOpen(params: DTO.ProgramParams): Promise<ResolvedProgram> {
    const resolved = await this.resolve(params);
    if (!resolved || !this.isOpen(resolved)) {
      return Exceptions.notFound(Errors.LOYALTY_PROGRAM_NOT_FOUND);
    }
    return resolved;
  }

  private async resolve(params: DTO.ProgramParams): Promise<ResolvedProgram | null> {
    const business = await this.businessesRepository.findBySlug(params.businessSlug);
    if (!business) return null;

    const program = await this.programsRepository.findBySlug(business.urn, params.programSlug);
    if (!program) return null;

    const location = await this.locationsRepository.findForBusiness(business.urn, program.locationUrn);
    return { business, program, location };
  }

  private isOpen(resolved: ResolvedProgram): boolean {
    return (
      resolved.business.status === BusinessStatus.ACTIVE &&
      hasFeature(resolved.business.plan, Feature.LOYALTY) &&
      isOperable(resolved)
    );
  }

  private publicBusiness(business: Business): PublicLoyaltySignup['business'] {
    return { name: business.name, slug: business.slug, logoUpdatedAt: business.logoUpdatedAt ?? null };
  }
}
