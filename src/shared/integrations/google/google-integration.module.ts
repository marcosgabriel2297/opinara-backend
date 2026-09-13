import { Module } from '@nestjs/common';

import { HttpClientModule } from '@shared/common/client';
import {
  GOOGLE_ACCOUNTS_ADAPTER,
  GOOGLE_LOCATIONS_ADAPTER,
  GOOGLE_OAUTH_ADAPTER,
  GOOGLE_REVIEWS_ADAPTER,
} from './adapters';
import {
  GoogleAccountsService,
  GoogleHttpService,
  GoogleLocationsService,
  GoogleOAuthService,
  GoogleReviewsService,
} from './services';

/**
 * Implementaciones concretas de los puertos hacia Google.
 * El dominio inyecta los tokens (`GOOGLE_*_ADAPTER`), nunca estas clases: asi los tests
 * corren con dobles y ningun modulo de negocio termina acoplado al HTTP de Google.
 */
@Module({
  imports: [HttpClientModule],
  providers: [
    GoogleHttpService,
    GoogleOAuthService,
    GoogleAccountsService,
    GoogleLocationsService,
    GoogleReviewsService,
    { provide: GOOGLE_OAUTH_ADAPTER, useExisting: GoogleOAuthService },
    { provide: GOOGLE_ACCOUNTS_ADAPTER, useExisting: GoogleAccountsService },
    { provide: GOOGLE_LOCATIONS_ADAPTER, useExisting: GoogleLocationsService },
    { provide: GOOGLE_REVIEWS_ADAPTER, useExisting: GoogleReviewsService },
  ],
  exports: [GOOGLE_OAUTH_ADAPTER, GOOGLE_ACCOUNTS_ADAPTER, GOOGLE_LOCATIONS_ADAPTER, GOOGLE_REVIEWS_ADAPTER],
})
export class GoogleIntegrationModule {}
