import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Un escaneo contado de un QR, con su fecha.
 *
 * Los contadores de la campaña (`stats.scans`) siguen siendo el total historico; este registro
 * existe para poder mostrar la evolucion en el tiempo. Solo hay datos desde que se empezo a
 * guardar: los escaneos anteriores estan en el total pero no tienen fecha.
 *
 * No guarda nada de quien escaneo (ni IP ni user agent): no hace falta para la metrica.
 */
@Schema({ collection: 'scan_events', timestamps: false, versionKey: false })
export class ScanEvent {
  @Prop({ required: true })
  businessUrn!: string;

  @Prop({ required: true })
  campaignUrn!: string;

  @Prop({ required: true })
  scannedAt!: Date;
}

export type ScanEventDocument = HydratedDocument<ScanEvent>;
export const ScanEventSchema = SchemaFactory.createForClass(ScanEvent);

// Las dos consultas: por negocio y por campaña, siempre acotadas por fecha.
ScanEventSchema.index({ businessUrn: 1, scannedAt: -1 });
ScanEventSchema.index({ businessUrn: 1, campaignUrn: 1, scannedAt: -1 });
