import { Inject, Injectable, Logger } from '@nestjs/common';

import { CryptoService } from '@shared/common/crypto';
import { MAILER, Mailer } from '@shared/common/mailer';
import { Business } from '@shared/models/business';
import { Location } from '@packages/locations';

import { LoyaltyMember, LoyaltyProgram } from '../models';
import { CardMailContext, cardLinkMail, rewardMail, welcomeMail } from './loyalty-mails';

export type CardMailKind = 'welcome' | 'link' | 'reward';

const TEMPLATES: Record<CardMailKind, (context: CardMailContext) => ReturnType<typeof welcomeMail>> = {
  welcome: welcomeMail,
  link: cardLinkMail,
  reward: rewardMail,
};

/**
 * Los mails al cliente de la tarjeta. Solo si dejo email, y nunca bloquean: si el proveedor falla,
 * el alta o el sello ya se hicieron.
 */
@Injectable()
export class LoyaltyCardMailer {
  private readonly logger = new Logger(LoyaltyCardMailer.name);

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly crypto: CryptoService,
  ) {}

  async send(
    kind: CardMailKind,
    target: { business: Business; program: LoyaltyProgram; location: Location | null; member: LoyaltyMember },
    cardToken?: string,
  ): Promise<void> {
    const { business, program, location, member } = target;
    if (!member.email) return;

    try {
      await this.mailer.send(
        TEMPLATES[kind]({
          to: member.email,
          name: member.name,
          businessName: business.name,
          locationTitle: location?.title ?? '',
          rewardDescription: program.rewardDescription,
          stampsRequired: program.stampsRequired,
          cardToken: cardToken ?? this.crypto.decrypt(member.cardToken),
        }),
      );
    } catch (error) {
      // Ni el email ni el token van al log.
      this.logger.error(`No se pudo mandar el mail "${kind}" de la tarjeta ${member.urn}: ${String(error)}`);
    }
  }
}
