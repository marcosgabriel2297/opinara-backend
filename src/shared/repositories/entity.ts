/**
 * Todo documento persistido expone un URN publico y timestamps.
 * Los `_id` de Mongo nunca salen de la capa de repositorios.
 */
export interface Entity {
  urn: string;
  createdAt?: Date;
  updatedAt?: Date;
}
