import { Inject, Injectable } from '@nestjs/common';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GoogleAccount,
  GoogleAccountsAdapter,
  GoogleApiError,
  GoogleLocation,
  GoogleLocationsAdapter,
  throwAsDomainError,
} from '@shared/integrations/google/exports';
import { LocationsService, PublicLocation, toPublicLocation } from '@packages/locations';

import * as DTO from '../dtos';
import { GoogleTokenService } from './google-token.service';

export interface AvailableLocation extends GoogleLocation {
  /** Ya fue importada por este business. */
  imported: boolean;
}

/**
 * Lectura del perfil de Google del business: cuentas, locations disponibles e importacion.
 * Todo pasa por los adapters; este servicio no conoce URLs ni HTTP de Google.
 */
@Injectable()
export class GoogleProfileService {
  constructor(
    private readonly tokenService: GoogleTokenService,
    private readonly locationsService: LocationsService,
    @Inject(GOOGLE_ACCOUNTS_ADAPTER) private readonly accounts: GoogleAccountsAdapter,
    @Inject(GOOGLE_LOCATIONS_ADAPTER) private readonly locations: GoogleLocationsAdapter,
  ) {}

  async listAccounts(businessUrn: string): Promise<GoogleAccount[]> {
    const accessToken = await this.tokenService.getAccessToken(businessUrn);

    return this.call(() => this.accounts.listAccounts(accessToken));
  }

  /** Locations de una cuenta de Google, marcando cuales ya estan importadas. */
  async listAvailableLocations(businessUrn: string, accountName: string): Promise<AvailableLocation[]> {
    const accessToken = await this.tokenService.getAccessToken(businessUrn);
    const [remote, importedNames] = await Promise.all([
      this.call(() => this.locations.listLocations(accessToken, accountName)),
      this.locationsService.findImportedGoogleNames(businessUrn),
    ]);

    return remote.map((location) => ({ ...location, imported: importedNames.has(location.name) }));
  }

  /**
   * Importa las locations elegidas por el negocio. Es idempotente: reimportar actualiza
   * los datos en vez de duplicar.
   */
  async importLocations(businessUrn: string, payload: DTO.ImportLocations): Promise<PublicLocation[]> {
    const accessToken = await this.tokenService.getAccessToken(businessUrn);
    const remote = await this.call(() => this.locations.listLocations(accessToken, payload.accountName));
    const byName = new Map(remote.map((location) => [location.name, location]));

    const selected = payload.locationNames.map((name) => {
      const location = byName.get(name);
      if (!location) {
        // Se pidio una location que la cuenta conectada no administra.
        Exceptions.notFound(Errors.GOOGLE_RESOURCE_NOT_FOUND);
      }

      return location;
    });

    const imported = await Promise.all(
      selected.map((location) => this.locationsService.upsertFromGoogle(businessUrn, payload.accountName, location)),
    );

    return imported.map(toPublicLocation);
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GoogleApiError) {
        return throwAsDomainError(error);
      }

      throw error;
    }
  }
}
