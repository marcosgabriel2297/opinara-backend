/** Forma unica de las respuestas paginadas de la API. */
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export const paginate = <T>(items: T[], page: number, limit: number, total: number): Paginated<T> => ({
  items,
  page,
  limit,
  total,
});
