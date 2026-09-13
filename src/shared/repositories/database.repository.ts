import { Injectable } from '@nestjs/common';
import { FilterQuery, Model, SortOrder, UpdateQuery } from 'mongoose';

import { Urn } from '@shared/common/urn';
import { Entity } from './entity';

export interface FindOptions<T> {
  page?: number;
  limit?: number;
  sort?: Partial<Record<keyof T & string, SortOrder>>;
}

/**
 * Repositorio base. Trabaja siempre con objetos planos (`lean`) para que los servicios
 * manipulen datos y no documentos de Mongoose.
 *
 * Convencion de multi-tenancy: los repositorios de entidades que pertenecen a un business
 * exponen metodos que reciben `businessUrn` y lo incluyen SIEMPRE en el filtro. Nunca se
 * busca por `urn` a secas, para que cambiar un id en la URL no alcance para ver datos ajenos.
 */
@Injectable()
export class DatabaseRepository<T extends Entity> {
  constructor(protected readonly model: Model<T>) {}

  one(urn: string): Promise<T | null> {
    return this.findOne({ urn } as FilterQuery<T>);
  }

  findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(filter).lean<T | null>().exec();
  }

  find(filter: FilterQuery<T> = {}, options: FindOptions<T> = {}): Promise<T[]> {
    const { page = 0, limit = 0, sort } = options;
    const query = this.model.find(filter);

    if (limit > 0) {
      query.skip(page * limit).limit(limit);
    }

    if (sort) {
      query.sort(sort as Record<string, SortOrder>);
    }

    return query.lean<T[]>().exec();
  }

  count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  /** Upsert por URN. Si el URN no viene, se genera uno nuevo con el nombre del modelo. */
  async createOrUpdate(entity: Partial<T> & { urn?: string }): Promise<T> {
    const { urn, ...fields } = entity;
    const result = await this.model
      .findOneAndUpdate(
        { urn: urn ?? Urn.createUUID(this.model.modelName.toLowerCase()) } as FilterQuery<T>,
        { $set: fields } as UpdateQuery<T>,
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      )
      .lean<T>()
      .exec();

    return result;
  }

  updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<T | null> {
    return this.model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean<T | null>().exec();
  }

  async deleteOne(filter: FilterQuery<T>): Promise<void> {
    await this.model.deleteOne(filter).exec();
  }
}
