import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { BusinessAccess, GetBusiness } from '@shared/common/decorators';
import { Business } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';
import { LocationsService } from '@packages/locations';

import * as Services from '../services';

/**
 * Disparo manual de la sincronizacion.
 *
 * La ruta vive bajo `/google` porque es la que define la API acordada, pero el controller
 * pertenece al paquete de reviews: es donde esta la logica, y asi se evita que el paquete
 * de google dependa del de reviews (que ya depende de google para los tokens).
 */
@Controller('businesses/:businessUrn')
export class ReviewSyncController {
  constructor(
    private readonly syncService: Services.Sync,
    private readonly locationsService: LocationsService,
  ) {}

  @Post('/google/sync')
  @HttpCode(HttpStatus.OK)
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  syncBusiness(@GetBusiness() business: Business) {
    return this.syncService.syncBusiness(business.urn);
  }

  @Post('/locations/:locationUrn/reviews/sync')
  @HttpCode(HttpStatus.OK)
  @BusinessAccess(BusinessMemberRole.OWNER, BusinessMemberRole.ADMIN)
  async syncLocation(@GetBusiness() business: Business, @Param('locationUrn') locationUrn: string) {
    const location = await this.locationsService.getOwned(business.urn, locationUrn);

    return this.syncService.syncLocation(location);
  }
}
