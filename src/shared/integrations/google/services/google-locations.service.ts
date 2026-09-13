import { Injectable } from '@nestjs/common';

import { GoogleLocation, GoogleLocationsAdapter } from '../adapters';
import { ListLocationsResponse } from '../dtos';
import { GoogleEndpoints, GoogleLimits, LOCATION_READ_MASK } from '../endpoints';
import { toGoogleLocation } from '../mappers';
import { GoogleHttpService } from './google-http.service';

/**
 * My Business Business Information API v1.
 * GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{id}/locations
 * `readMask` es obligatorio y `pageSize` tiene tope 100.
 */
@Injectable()
export class GoogleLocationsService implements GoogleLocationsAdapter {
  constructor(private readonly http: GoogleHttpService) {}

  async listLocations(accessToken: string, accountName: string): Promise<GoogleLocation[]> {
    const locations: GoogleLocation[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.http.get<ListLocationsResponse>(
        'accounts.locations.list',
        `${GoogleEndpoints.BusinessInformation}/${accountName}/locations`,
        accessToken,
        { readMask: LOCATION_READ_MASK, pageSize: GoogleLimits.LocationsPageSize, pageToken },
      );

      for (const location of response.locations ?? []) {
        const mapped = toGoogleLocation(location);
        if (mapped) {
          locations.push(mapped);
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return locations;
  }
}
