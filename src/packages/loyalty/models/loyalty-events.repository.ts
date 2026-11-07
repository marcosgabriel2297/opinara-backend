import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Urn } from '@shared/common/urn';
import { DatabaseRepository } from '@shared/repositories';

import { LOYALTY_EVENT_ENTITY, LoyaltyEvent } from './loyalty-event.model';

@Injectable()
export class LoyaltyEventsRepository extends DatabaseRepository<LoyaltyEvent> {
  constructor(@InjectModel(LoyaltyEvent.name) model: Model<LoyaltyEvent>) {
    super(model);
  }

  async record(event: Omit<LoyaltyEvent, 'urn' | 'createdAt' | 'undoneAt'>): Promise<LoyaltyEvent> {
    const created = await this.model.create({ ...event, urn: Urn.createUUID(LOYALTY_EVENT_ENTITY), undoneAt: null });
    return created.toObject();
  }

  findForBusiness(businessUrn: string, urn: string): Promise<LoyaltyEvent | null> {
    return this.findOne({ businessUrn, urn });
  }

  /** La ultima accion vigente de la tarjeta: es la unica que se puede deshacer. */
  async latestActiveForMember(businessUrn: string, memberUrn: string): Promise<LoyaltyEvent | null> {
    const [latest] = await this.find(
      { businessUrn, memberUrn, undoneAt: null },
      { limit: 1, sort: { createdAt: 'desc' } },
    );
    return latest ?? null;
  }

  /** Marca el evento como deshecho solo si no lo estaba: dos "deshacer" seguidos revierten una vez. */
  markUndone(businessUrn: string, urn: string, byUserUrn: string, now: Date): Promise<LoyaltyEvent | null> {
    return this.updateOne(
      { businessUrn, urn, undoneAt: null },
      { $set: { undoneAt: now, undoneByUserUrn: byUserUrn } },
    );
  }
}
