import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { Business } from './business.model';

@Injectable()
export class BusinessesRepository extends DatabaseRepository<Business> {
  constructor(@InjectModel(Business.name) model: Model<Business>) {
    super(model);
  }

  findBySlug(slug: string): Promise<Business | null> {
    return this.findOne({ slug: slug.toLowerCase().trim() });
  }

  findByUrns(urns: string[]): Promise<Business[]> {
    return this.find({ urn: { $in: urns } }, { sort: { createdAt: 'asc' } });
  }
}
