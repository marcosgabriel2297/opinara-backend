import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { mongo, Model } from 'mongoose';

import { LogoContentType } from '../logo-image';
import { BusinessLogo } from './business-logo.model';

/** No extiende `DatabaseRepository`: un logo no es una entidad con URN, es un archivo del business. */
@Injectable()
export class BusinessLogosRepository {
  constructor(@InjectModel(BusinessLogo.name) private readonly model: Model<BusinessLogo>) {}

  async save(businessUrn: string, data: Buffer, contentType: LogoContentType): Promise<void> {
    await this.model.updateOne({ businessUrn }, { $set: { data, contentType } }, { upsert: true });
  }

  async findByBusiness(businessUrn: string): Promise<BusinessLogo | null> {
    const logo = await this.model
      .findOne({ businessUrn })
      .lean<Omit<BusinessLogo, 'data'> & { data: unknown }>()
      .exec();
    if (logo === null) return null;

    // Con `lean()` los bytes llegan como `Binary` del driver, no como `Buffer`.
    const data = logo.data instanceof mongo.Binary ? Buffer.from(logo.data.buffer) : logo.data;
    if (!Buffer.isBuffer(data)) return null;

    return { ...logo, data };
  }

  async remove(businessUrn: string): Promise<void> {
    await this.model.deleteOne({ businessUrn });
  }
}
