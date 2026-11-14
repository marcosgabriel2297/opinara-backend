/**
 * La fecha de hoy (`YYYY-MM-DD`) en `timezone`. `en-CA` es el locale que formatea asi. Es el mismo
 * calculo que el de campañas, copiado para que fidelizacion no dependa de ese paquete.
 */
export const todayIn = (timezone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    now,
  );
