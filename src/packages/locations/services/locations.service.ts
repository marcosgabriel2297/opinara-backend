import { Injectable } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Urn } from '@shared/common/urn';
import { GoogleLocation } from '@shared/integrations/google/exports';
import { LocationSource } from '@shared/models/enums/location';
import { isDuplicateKeyError } from '@shared/utils';

import * as DTO from '../dtos';
import { LOCATION_ENTITY, Location, LocationsRepository, PublicLocation, toPublicLocation } from '../models';

/** Link de Google para dejar una reseña. Se arma con el placeId, sin llamar a la API. */
const reviewUriFor = (placeId: string): string =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

/** Ficha del local en Maps. Mismo caso: sale del placeId. */
const mapsUriFor = (placeId: string): string =>
  `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;

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

  /**
   * Alta manual de una sucursal, sin pasar por la API de Google.
   *
   * Existe porque el acceso a las APIs de Google se aprueba por proyecto y tarda, pero el
   * circuito del QR -escaneo y salto a Google- no necesita la API: solo el
   * link de reseña, que sale del placeId. Lo que si queda pendiente hasta la aprobacion es
   * traer y responder las reseñas.
   *
   * Los identificadores de Google se completan con valores de relleno, marcados por `source`,
   * para no dejar campos opcionales que el resto del sistema tendria que chequear en todos
   * lados. Cuando el negocio conecta Google, `upsertFromGoogle` adopta esta sucursal por
   * placeId y le pone los identificadores reales, conservando su urn.
   */
  async createManual(businessUrn: string, payload: DTO.CreateLocation): Promise<PublicLocation> {
    if (await this.locationsRepository.findByPlaceId(businessUrn, payload.placeId)) {
      Exceptions.conflict(Errors.LOCATION_ALREADY_IMPORTED);
    }

    const urn = Urn.createUUID(LOCATION_ENTITY);
    const placeholder = Urn.id(urn);

    try {
      const location = await this.locationsRepository.createOrUpdate({
        urn,
        businessUrn,
        googleAccountName: `accounts/manual-${placeholder}`,
        googleLocationName: `locations/manual-${placeholder}`,
        googleLocationId: `manual-${placeholder}`,
        title: payload.title,
        storeCode: payload.storeCode,
        placeId: payload.placeId,
        mapsUri: mapsUriFor(payload.placeId),
        newReviewUri: reviewUriFor(payload.placeId),
        address: payload.address,
        hasVoiceOfMerchant: false,
        source: LocationSource.MANUAL,
        isActive: true,
      });

      return toPublicLocation(location);
    } catch (error) {
      // Dos altas del mismo local a la vez: el indice unico por placeId es el que decide.
      if (isDuplicateKeyError(error)) {
        Exceptions.conflict(Errors.LOCATION_ALREADY_IMPORTED);
      }

      throw error;
    }
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
    // Si el local ya estaba dado de alta a mano, se adopta esa sucursal en vez de crear una
    // nueva: conserva su urn y con el las campañas, los QR impresos y sus metricas.
    const existing =
      (await this.locationsRepository.findByGoogleName(businessUrn, location.name)) ??
      (location.placeId ? await this.locationsRepository.findByPlaceId(businessUrn, location.placeId) : null);

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
      source: LocationSource.GOOGLE,
      isActive: existing?.isActive ?? true,
    });
  }
}
