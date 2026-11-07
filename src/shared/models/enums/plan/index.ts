/**
 * Planes de Opinara. Por ahora los asigna un admin a mano desde el panel; todavía no hay cobro
 * (ver `FUTURAS-FUNCIONALIDADES.md`, punto 9).
 *
 * Qué incluye cada plan vive solo en `PLAN_FEATURES`: el resto del backend pregunta por una
 * funcionalidad (`hasFeature`), nunca por el nombre del plan. Sumar un plan es sumar una fila.
 */
export enum BusinessPlan {
  /** QR a Google, gestión y respuestas de reseñas. */
  REVIEWS = 'REVIEWS',
  /** Lo anterior más la tarjeta de sellos por sucursal. */
  REVIEWS_LOYALTY = 'REVIEWS_LOYALTY',
}

/** Funcionalidades que dependen del plan. Lo que no está acá lo tienen todos los planes. */
export enum Feature {
  LOYALTY = 'LOYALTY',
}

export const DEFAULT_BUSINESS_PLAN = BusinessPlan.REVIEWS;

export const PLAN_FEATURES: Record<BusinessPlan, readonly Feature[]> = {
  [BusinessPlan.REVIEWS]: [],
  [BusinessPlan.REVIEWS_LOYALTY]: [Feature.LOYALTY],
};

/** Los negocios creados antes de que existieran los planes no tienen `plan`: cuentan como el de entrada. */
export const featuresOf = (plan: BusinessPlan | undefined): readonly Feature[] =>
  PLAN_FEATURES[plan ?? DEFAULT_BUSINESS_PLAN] ?? [];

export const hasFeature = (plan: BusinessPlan | undefined, feature: Feature): boolean =>
  featuresOf(plan).includes(feature);
