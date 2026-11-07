import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';

import { LoyaltyProgram, LoyaltyProgramStats } from './loyalty-program.model';

@Injectable()
export class LoyaltyProgramsRepository extends DatabaseRepository<LoyaltyProgram> {
  constructor(@InjectModel(LoyaltyProgram.name) model: Model<LoyaltyProgram>) {
    super(model);
  }

  findAllForBusiness(businessUrn: string): Promise<LoyaltyProgram[]> {
    return this.find({ businessUrn }, { sort: { createdAt: 'asc' } });
  }

  findForBusiness(businessUrn: string, urn: string): Promise<LoyaltyProgram | null> {
    return this.findOne({ businessUrn, urn });
  }

  findByLocation(businessUrn: string, locationUrn: string): Promise<LoyaltyProgram | null> {
    return this.findOne({ businessUrn, locationUrn });
  }

  findBySlug(businessUrn: string, slug: string): Promise<LoyaltyProgram | null> {
    return this.findOne({ businessUrn, slug: slug.toLowerCase().trim() });
  }

  /** Contadores con `$inc`: dos cajas a la vez no pierden cuentas. `amount` puede ser negativo (deshacer). */
  async increment(
    businessUrn: string,
    urn: string,
    counters: Partial<Record<keyof LoyaltyProgramStats, number>>,
  ): Promise<void> {
    const inc = Object.fromEntries(Object.entries(counters).map(([counter, amount]) => [`stats.${counter}`, amount]));
    await this.model.updateOne({ businessUrn, urn }, { $inc: inc }).exec();
  }
}
