import { lastMondays, todayIn } from './scan-weeks';

describe('semanas de escaneos', () => {
  it('la fecha de hoy depende de la zona del negocio, no del servidor', () => {
    // 02:00 UTC del martes: en Buenos Aires todavía es lunes.
    const now = new Date('2026-10-27T02:00:00Z');
    expect(todayIn('America/Argentina/Buenos_Aires', now)).toBe('2026-10-26');
    expect(todayIn('UTC', now)).toBe('2026-10-27');
  });

  it('devuelve los lunes de las últimas semanas, del más viejo a la actual', () => {
    const now = new Date('2026-10-29T15:00:00Z'); // jueves
    expect(lastMondays('UTC', 3, now)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    const now = new Date('2026-11-01T15:00:00Z'); // domingo
    expect(lastMondays('UTC', 1, now)).toEqual(['2026-10-26']);
  });

  it('un cambio de horario no corre los lunes', () => {
    // En Madrid el horario cambia el último domingo de octubre.
    const now = new Date('2026-11-04T12:00:00Z');
    expect(lastMondays('Europe/Madrid', 3, now)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
  });
});
