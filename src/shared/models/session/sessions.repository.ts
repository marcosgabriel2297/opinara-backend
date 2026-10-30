import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { Session } from './session.model';

@Injectable()
export class SessionsRepository extends DatabaseRepository<Session> {
  constructor(@InjectModel(Session.name) model: Model<Session>) {
    super(model);
  }

  /** La sesion, si sigue vigente: la consulta que autoriza cada request. */
  findActive(urn: string, now: Date = new Date()): Promise<Session | null> {
    return this.findOne({ urn, revokedAt: { $exists: false }, expiresAt: { $gt: now } });
  }

  async revoke(urn: string, now: Date = new Date()): Promise<void> {
    await this.model.updateOne({ urn, revokedAt: { $exists: false } }, { $set: { revokedAt: now } }).exec();
  }

  /** Todas las del usuario: "cerrar sesion en todos lados" y el cambio de contraseña. */
  async revokeAllForUser(userUrn: string, now: Date = new Date()): Promise<void> {
    await this.model.updateMany({ userUrn, revokedAt: { $exists: false } }, { $set: { revokedAt: now } }).exec();
  }

  /** Todas las del usuario menos `keepUrn`: cambiar la contraseña sin salir de este dispositivo. */
  async revokeOthersForUser(userUrn: string, keepUrn: string, now: Date = new Date()): Promise<void> {
    await this.model
      .updateMany({ userUrn, urn: { $ne: keepUrn }, revokedAt: { $exists: false } }, { $set: { revokedAt: now } })
      .exec();
  }
}
