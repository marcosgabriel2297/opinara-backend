/** Formatos que se aceptan para el logo. SVG no: servido desde la API podria ejecutar scripts. */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

/** El frontend lo sube achicado (512px de lado mayor, pocas decenas de KB): esto es solo un tope. */
export const LOGO_MAX_BYTES = 300 * 1024;

const startsWith = (data: Buffer, bytes: number[], offset = 0): boolean =>
  data.length >= offset + bytes.length && bytes.every((byte, index) => data[offset + index] === byte);

/**
 * El tipo real de la imagen, por sus primeros bytes. El `Content-Type` del request lo declara el
 * cliente; esto es lo que se sirve despues, asi que se verifica contra el contenido.
 */
export function detectLogoType(data: Buffer): LogoContentType | null {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // "RIFF" .... "WEBP"
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
