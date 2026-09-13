import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { Location } from './location.model';

@Injectable()
export class LocationsRepository extends DatabaseRepository<Location> {
  constructor(@InjectModel(Location.name) model: Model<Location>) {
    super(model);
  }

  /**
   * Todas las lecturas llevan `businessUrn` en el filtro: es la regla de aislamiento
   * multi-tenant del proyecto. Nunca se busca una location solo por su urn.
   */
  findAllForBusiness(businessUrn: string): Promise<Location[]> {
    return this.find({ businessUrn }, { sort: { title: 'asc' } });
  }

  findForBusiness(businessUrn: string, urn: string): Promise<Location | null> {
    return this.findOne({ businessUrn, urn });
  }

  findByGoogleName(businessUrn: string, googleLocationName: string): Promise<Location | null> {
    return this.findOne({ businessUrn, googleLocationName });
  }

  findActiveForBusiness(businessUrn: string): Promise<Location[]> {
    return this.find({ businessUrn, isActive: true });
  }

  /** Locations de todos los tenants: lo usa el cron de sincronizacion. */
  findAllActive(): Promise<Location[]> {
    return this.find({ isActive: true }, { sort: { businessUrn: 'asc' } });
  }

  markReviewSync(urn: string, syncedAt: Date): Promise<Location | null> {
    return this.updateOne({ urn }, { $set: { lastReviewSyncAt: syncedAt } });
  }
}
