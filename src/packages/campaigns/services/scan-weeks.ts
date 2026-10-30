const DAY_MS = 24 * 60 * 60 * 1000;

/** La fecha de hoy (`YYYY-MM-DD`) en `timezone`. `en-CA` es el locale que formatea así. */
export const todayIn = (timezone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    now,
  );

/**
 * Los lunes de las últimas `count` semanas (la actual incluida), del más viejo al más nuevo.
 *
 * Se calcula sobre fechas de calendario (mediodía UTC de cada día), no sobre instantes: así un
 * cambio de horario en la zona del negocio no corre ningún lunes de día.
 */
export const lastMondays = (timezone: string, count: number, now: Date = new Date()): string[] => {
  const [year, month, day] = todayIn(timezone, now).split('-').map(Number) as [number, number, number];
  const today = Date.UTC(year, month - 1, day, 12);
  // getUTCDay: 0 domingo … 6 sábado. Días desde el lunes: domingo cuenta 6.
  const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
  const thisMonday = today - sinceMonday * DAY_MS;

  return Array.from({ length: count }, (_, index) =>
    new Date(thisMonday - (count - 1 - index) * 7 * DAY_MS).toISOString().slice(0, 10),
  );
};
