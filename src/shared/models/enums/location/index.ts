/**
 * De donde salio la sucursal.
 *
 * `MANUAL` existe para poder operar antes de tener acceso a las APIs de Google: el
 * QR no necesita la API, solo el link de reseña,
 * que se arma con el placeId. Una sucursal manual no se sincroniza contra Google; cuando
 * el negocio conecta su cuenta, la importacion la adopta por placeId y pasa a `GOOGLE`.
 */
export enum LocationSource {
  GOOGLE = 'GOOGLE',
  MANUAL = 'MANUAL',
}
