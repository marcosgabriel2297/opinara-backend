import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { ScanEvent } from './scan-event.model';

export interface WeeklyScanCount {
  /** Lunes de la semana, `YYYY-MM-DD` en la zona horaria pedida. */
  week: string;
  scans: number;
}

/**
 * No extiende `DatabaseRepository`: un escaneo no es una entidad con URN, es un evento que solo
 * se inserta y se agrega.
 */
@Injectable()
export class ScanEventsRepository {
  constructor(@InjectModel(ScanEvent.name) private readonly model: Model<ScanEvent>) {}

  async record(businessUrn: string, campaignUrn: string, scannedAt: Date = new Date()): Promise<void> {
    await this.model.create({ businessUrn, campaignUrn, scannedAt });
  }

  /** Escaneos por semana (lunes a domingo, en `timezone`) desde `since`. Solo semanas con datos. */
  weekly(businessUrn: string, since: Date, timezone: string, campaignUrn?: string): Promise<WeeklyScanCount[]> {
    const match: FilterQuery<ScanEvent> = { businessUrn, scannedAt: { $gte: since } };
    if (campaignUrn !== undefined) match.campaignUrn = campaignUrn;

    return this.model
      .aggregate<WeeklyScanCount>([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $dateTrunc: { date: '$scannedAt', unit: 'week', startOfWeek: 'monday', timezone } },
                timezone,
              },
            },
            scans: { $sum: 1 },
          },
        },
        { $project: { _id: 0, week: '$_id', scans: 1 } },
      ])
      .exec();
  }

  /** Fecha del primer escaneo registrado: desde ahi hay datos por fecha. */
  async firstScanAt(businessUrn: string, campaignUrn?: string): Promise<Date | null> {
    const filter: FilterQuery<ScanEvent> = { businessUrn };
    if (campaignUrn !== undefined) filter.campaignUrn = campaignUrn;

    const first = await this.model.findOne(filter).sort({ scannedAt: 1 }).lean<ScanEvent | null>().exec();
    return first?.scannedAt ?? null;
  }
}
