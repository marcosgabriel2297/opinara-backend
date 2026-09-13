import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { QRCode } from './qr-code.model';

@Injectable()
export class QRCodesRepository extends DatabaseRepository<QRCode> {
  constructor(@InjectModel(QRCode.name) model: Model<QRCode>) {
    super(model);
  }

  findByCampaign(businessUrn: string, campaignUrn: string): Promise<QRCode | null> {
    return this.findOne({ businessUrn, campaignUrn });
  }
}
