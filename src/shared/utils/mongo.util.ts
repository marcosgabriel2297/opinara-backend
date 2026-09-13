const DUPLICATE_KEY_ERROR = 11000;

/**
 * Detecta el error de clave duplicada de Mongo (E11000).
 * Los chequeos "existe? entonces creo" tienen una ventana de carrera: dos requests
 * concurrentes pasan el chequeo y solo el indice unico frena al segundo. Ese error hay que
 * traducirlo a un 409, no dejar que escale a 500.
 */
export const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === DUPLICATE_KEY_ERROR;
