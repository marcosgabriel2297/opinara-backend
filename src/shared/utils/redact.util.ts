const SENSITIVE_KEY = /(token|secret|password|authorization|credential|client_id|code|assertion)/i;

/**
 * Cursores de paginacion de Google: contienen "token" pero no son secretos, y ocultarlos
 * solo hace mas dificil depurar la paginacion.
 */
const PUBLIC_KEY = /^(next|prev|previous)?_?page_?token$/i;
const REDACTED = '[REDACTED]';

/**
 * Devuelve una copia del valor con los campos sensibles reemplazados.
 * Se usa antes de loguear cualquier payload de una integracion: los access/refresh
 * tokens de Google no deben aparecer nunca en los logs.
 */
export const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, item]) => {
    const sensitive = SENSITIVE_KEY.test(key) && !PUBLIC_KEY.test(key);
    acc[key] = sensitive ? REDACTED : redact(item, depth + 1);
    return acc;
  }, {});
};

export const redactToString = (value: unknown): string => {
  try {
    return JSON.stringify(redact(value)) ?? '';
  } catch {
    return '[UNSERIALIZABLE]';
  }
};
