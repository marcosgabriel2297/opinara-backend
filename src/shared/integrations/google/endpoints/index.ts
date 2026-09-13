/**
 * URLs oficiales de las APIs de Google Business Profile. Unico lugar del codigo donde
 * aparecen: si Google migra un endpoint, se cambia aca.
 *
 * Importante: las reviews siguen viviendo en la API legacy v4.9 (`mybusiness.googleapis.com`);
 * no existe reemplazo en las APIs v1 al dia de hoy.
 */
export const GoogleEndpoints = {
  AccountManagement: 'https://mybusinessaccountmanagement.googleapis.com/v1',
  BusinessInformation: 'https://mybusinessbusinessinformation.googleapis.com/v1',
  Legacy: 'https://mybusiness.googleapis.com/v4',
  Notifications: 'https://mybusinessnotifications.googleapis.com/v1',
} as const;

/** Unico scope necesario para gestionar perfiles de negocio. */
export const GOOGLE_BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';

/**
 * `readMask` es obligatorio en accounts.locations.list. Se piden solo los campos que el
 * producto usa: metadata trae placeId, mapsUri y newReviewUri (el link para dejar reseña).
 */
export const LOCATION_READ_MASK = 'name,title,storeCode,languageCode,storefrontAddress,metadata';

/** Topes documentados por Google. */
export const GoogleLimits = {
  AccountsPageSize: 20,
  LocationsPageSize: 100,
  ReviewsPageSize: 50,
} as const;
