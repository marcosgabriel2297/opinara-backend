import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { LocationSource } from '@shared/models/enums/location';
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

  /** El placeId es el unico identificador que comparten el alta manual y la importacion. */
  findByPlaceId(businessUrn: string, placeId: string): Promise<Location | null> {
    return this.findOne({ businessUrn, placeId });
  }

  /**
   * Activas y sincronizables. Las manuales quedan afuera a proposito: sus identificadores
   * de Google son de relleno, asi que pedirlas a la API seria un 404 por sucursal y por
   * corrida, consumiendo la cuota compartida del proyecto.
   *
   * Se excluye por `$ne: MANUAL` y no por `source: GOOGLE` para que las locations anteriores
   * a este campo -que no lo tienen- se sigan sincronizando sin necesidad de migrar la base.
   */
  findActiveForBusiness(businessUrn: string): Promise<Location[]> {
    return this.find({ businessUrn, isActive: true, source: { $ne: LocationSource.MANUAL } });
  }

  /** Locations de todos los tenants: lo usa el cron de sincronizacion. */
  findAllActive(): Promise<Location[]> {
    return this.find({ isActive: true, source: { $ne: LocationSource.MANUAL } }, { sort: { businessUrn: 'asc' } });
  }

  markReviewSync(urn: string, syncedAt: Date): Promise<Location | null> {
    return this.updateOne({ urn }, { $set: { lastReviewSyncAt: syncedAt } });
  }
}
