import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CampaignStatus } from '@shared/models/enums/campaign';
import { DatabaseRepository } from '@shared/repositories';
import { Campaign } from './campaign.model';

/** Contadores de la campaña. */
export type CampaignCounter = 'scans' | 'googleClicks';

@Injectable()
export class CampaignsRepository extends DatabaseRepository<Campaign> {
  constructor(@InjectModel(Campaign.name) model: Model<Campaign>) {
    super(model);
  }

  findAllForBusiness(businessUrn: string): Promise<Campaign[]> {
    return this.find({ businessUrn }, { sort: { createdAt: 'desc' } });
  }

  findForBusiness(businessUrn: string, urn: string): Promise<Campaign | null> {
    return this.findOne({ businessUrn, urn });
  }

  findBySlug(businessUrn: string, slug: string): Promise<Campaign | null> {
    return this.findOne({ businessUrn, slug: slug.toLowerCase().trim() });
  }

  findActiveBySlug(businessUrn: string, slug: string): Promise<Campaign | null> {
    return this.findOne({ businessUrn, slug: slug.toLowerCase().trim(), status: CampaignStatus.ACTIVE });
  }

  /**
   * Incremento atomico: la landing publica puede recibir varios escaneos a la vez y
   * leer-sumar-escribir perderia cuentas.
   */
  async increment(urn: string, counters: CampaignCounter[], amount = 1): Promise<void> {
    const inc = Object.fromEntries(counters.map((counter) => [`stats.${counter}`, amount]));
    await this.model.updateOne({ urn }, { $inc: inc }).exec();
  }
}
