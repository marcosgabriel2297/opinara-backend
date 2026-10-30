import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { PasswordReset } from './password-reset.model';

@Injectable()
export class PasswordResetsRepository {
  constructor(@InjectModel(PasswordReset.name) private readonly model: Model<PasswordReset>) {}

  /** Un pedido nuevo deja sin efecto los anteriores: solo sirve el ultimo link. */
  async replace(userUrn: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.model.deleteMany({ userUrn, usedAt: { $exists: false } }).exec();
    await this.model.create({ userUrn, tokenHash, expiresAt });
  }

  /**
   * Lo marca usado y lo devuelve, en una sola operacion: dos pedidos simultaneos con el mismo
   * link no pueden usarlo los dos.
   */
  consume(tokenHash: string, now: Date = new Date()): Promise<PasswordReset | null> {
    return this.model
      .findOneAndUpdate(
        { tokenHash, usedAt: { $exists: false }, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { new: true },
      )
      .lean<PasswordReset>()
      .exec();
  }
}
