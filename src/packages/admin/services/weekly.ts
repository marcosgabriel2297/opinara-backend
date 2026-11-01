import { FilterQuery, Model } from 'mongoose';

import { lastMondays } from '@packages/campaigns';

import config from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Las semanas de un reporte: sus lunes (`YYYY-MM-DD`, del más viejo al actual) y desde cuándo contar. */
export function weekWindow(weeks: number, now: Date = new Date()): { mondays: string[]; since: Date } {
  const mondays = lastMondays(config.Timezone, weeks, now);
  // Un día de margen: el lunes en Argentina empieza el domingo a la noche en UTC.
  const since = new Date(Date.parse(`${mondays[0] ?? ''}T00:00:00Z`) - DAY_MS);
  return { mondays, since };
}

/** Cuántos documentos por semana (lunes a domingo, en hora de Argentina) según `field`, desde `since`. */
export async function weeklyCounts<T>(
  model: Model<T>,
  field: string,
  since: Date,
  match: FilterQuery<T> = {},
): Promise<Map<string, number>> {
  const timezone = config.Timezone;
  const rows = await model
    .aggregate<{ _id: string; count: number }>([
      { $match: { ...match, [field]: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: { $dateTrunc: { date: `$${field}`, unit: 'week', startOfWeek: 'monday', timezone } },
              timezone,
            },
          },
          count: { $sum: 1 },
        },
      },
    ])
    .exec();

  return new Map(rows.map((row) => [row._id, row.count]));
}
