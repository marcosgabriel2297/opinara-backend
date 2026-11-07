/**
 * Normaliza un celular a E.164 para poder buscarlo y evitar duplicados ("11 2345-6789",
 * "011 15 2345 6789" y "+54 9 11 2345 6789" son el mismo numero).
 *
 * Un numero argentino es codigo de area (2 a 4 digitos, empieza con 1, 2 o 3) mas el abonado,
 * 10 digitos en total; los celulares en E.164 llevan un 9 despues del 54. Se aceptan el 0 de
 * larga distancia y el 15 del celular escrito a la vieja usanza. Sin una tabla de codigos de area
 * el 15 se busca despues de 2 digitos (solo para el 11, el unico de 2), de 3 o de 4: alcanza para
 * los formatos que escribe la gente.
 *
 * Con `+` y otro codigo de pais se acepta tal cual (turistas), si el largo es razonable.
 * Devuelve `null` si no parece un celular.
 */
export const normalizePhone = (input: string): string | null => {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+') && !digits.startsWith('54')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  let national = digits;
  if (national.startsWith('54')) national = national.slice(2);
  if (national.startsWith('9')) national = national.slice(1);
  if (national.startsWith('0')) national = national.slice(1);

  if (national.length === 12) {
    national = withoutMobilePrefix(national);
  }

  if (national.length !== 10 || !/^[123]/.test(national) || national.startsWith('15')) {
    return null;
  }

  return `+549${national}`;
};

const withoutMobilePrefix = (national: string): string => {
  const areaLengths = national.startsWith('11') ? [2] : [3, 4];
  for (const length of areaLengths) {
    if (national.slice(length, length + 2) === '15') {
      return national.slice(0, length) + national.slice(length + 2);
    }
  }
  return national;
};
