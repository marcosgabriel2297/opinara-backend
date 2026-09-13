import { Injectable } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Urn } from '@shared/common/urn';
import { GoogleLocation } from '@shared/integrations/google/exports';

import { LOCATION_ENTITY, Location, LocationsRepository, PublicLocation, toPublicLocation } from '../models';

@Injectable()
export class LocationsService {
  constructor(private readonly locationsRepository: LocationsRepository) {}

  async findAll(businessUrn: string): Promise<PublicLocation[]> {
    const locations = await this.locationsRepository.findAllForBusiness(businessUrn);
    return locations.map(toPublicLocation);
  }

  async findOne(businessUrn: string, urn: string): Promise<PublicLocation> {
    return toPublicLocation(await this.getOwned(businessUrn, urn));
  }

  /** Todas las locations activas del sistema. Solo para procesos internos (cron de sync). */
  findAllActive(): Promise<Location[]> {
    return this.locationsRepository.findAllActive();
  }

  findActiveForBusiness(businessUrn: string): Promise<Location[]> {
    return this.locationsRepository.findActiveForBusiness(businessUrn);
  }

  /**
   * Marca el momento en que arranco la ultima sincronizacion exitosa.
   * Se guarda el inicio y no el fin para no perder reseñas que hayan cambiado durante la corrida.
   */
  async markReviewSync(urn: string, startedAt: Date): Promise<void> {
    await this.locationsRepository.markReviewSync(urn, startedAt);
  }

  /** Nombres de Google (`locations/{id}`) ya importados, para marcar el listado de disponibles. */
  async findImportedGoogleNames(businessUrn: string): Promise<Set<string>> {
    const locations = await this.locationsRepository.findAllForBusiness(businessUrn);
    return new Set(locations.map((location) => location.googleLocationName));
  }

  /** Busca una location del business o corta con 404: usado por reviews y campañas. */
  async getOwned(businessUrn: string, urn: string): Promise<Location> {
    if (!Urn.isValid(urn, LOCATION_ENTITY)) {
      Exceptions.notFound(Errors.LOCATION_NOT_FOUND);
    }

    const location = await this.locationsRepository.findForBusiness(businessUrn, urn);
    if (!location) {
      Exceptions.notFound(Errors.LOCATION_NOT_FOUND);
    }

    return location;
  }

  /**
   * Alta o actualizacion de una location traida de Google.
   * Es idempotente: reimportar refresca titulo, direccion y links sin duplicar ni perder
   * el estado local (`lastReviewSyncAt`, `isActive`).
   */
  async upsertFromGoogle(businessUrn: string, accountName: string, location: GoogleLocation): Promise<Location> {
    const existing = await this.locationsRepository.findByGoogleName(businessUrn, location.name);

    return this.locationsRepository.createOrUpdate({
      urn: existing?.urn ?? Urn.createUUID(LOCATION_ENTITY),
      businessUrn,
      googleAccountName: accountName,
      googleLocationName: location.name,
      googleLocationId: location.locationId,
      title: location.title,
      storeCode: location.storeCode,
      placeId: location.placeId,
      mapsUri: location.mapsUri,
      newReviewUri: location.newReviewUri,
      address: location.address,
      hasVoiceOfMerchant: location.hasVoiceOfMerchant,
      isActive: existing?.isActive ?? true,
    });
  }
}
