import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Paginated, paginate } from '@shared/common/interfaces';
import { Business } from '@shared/models/business';
import { Location } from '@packages/locations';
import { PublicReview, toPublicReview } from '@packages/reviews';

import * as DTO from '../dtos';
import { AdminReviewFilters, AdminReviewsRepository, AdminReviewsSummary } from '../models';

export interface AdminReview extends PublicReview {
  business: { urn: string; name: string } | null;
  location: { urn: string; title: string } | null;
}

export interface AdminBusinessOption {
  urn: string;
  name: string;
  slug: string;
  status: string;
  locations: { urn: string; title: string }[];
}

const toFilters = (dto: DTO.ReviewFilters): AdminReviewFilters => ({
  businessUrn: dto.businessUrn,
  locationUrn: dto.locationUrn,
  rating: dto.rating,
  hasReply: dto.hasReply,
  from: dto.from ? new Date(dto.from) : undefined,
  to: dto.to ? new Date(dto.to) : undefined,
  search: dto.search?.trim() || undefined,
});

/** Reportes de toda la plataforma para el panel del administrador. Solo lectura. */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly reviewsRepository: AdminReviewsRepository,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
  ) {}

  async listReviews(dto: DTO.ListReviews): Promise<Paginated<AdminReview>> {
    const filters = toFilters(dto);
    const page = dto.page ?? 0;
    const limit = dto.limit ?? DTO.ADMIN_DEFAULT_PAGE_SIZE;

    const [reviews, total] = await Promise.all([
      this.reviewsRepository.findPage(filters, page, limit, dto.order ?? 'newest'),
      this.reviewsRepository.count(filters),
    ]);

    // Negocio y sucursal de cada reseña en dos consultas, no una por fila.
    const [businesses, locations] = await Promise.all([
      this.businessModel
        .find({ urn: { $in: [...new Set(reviews.map((review) => review.businessUrn))] } })
        .select('urn name')
        .lean<Pick<Business, 'urn' | 'name'>[]>()
        .exec(),
      this.locationModel
        .find({ urn: { $in: [...new Set(reviews.map((review) => review.locationUrn))] } })
        .select('urn title')
        .lean<Pick<Location, 'urn' | 'title'>[]>()
        .exec(),
    ]);
    const businessByUrn = new Map(businesses.map((business) => [business.urn, business]));
    const locationByUrn = new Map(locations.map((location) => [location.urn, location]));

    const items = reviews.map((review) => {
      const business = businessByUrn.get(review.businessUrn);
      const location = locationByUrn.get(review.locationUrn);
      return {
        ...toPublicReview(review),
        business: business ? { urn: business.urn, name: business.name } : null,
        location: location ? { urn: location.urn, title: location.title } : null,
      };
    });

    return paginate(items, page, limit, total);
  }

  reviewsSummary(dto: DTO.ReviewFilters): Promise<AdminReviewsSummary> {
    return this.reviewsRepository.summary(toFilters(dto));
  }

  /** Negocios con sus sucursales: alimentan los filtros del panel. */
  async businesses(): Promise<AdminBusinessOption[]> {
    const [businesses, locations] = await Promise.all([
      this.businessModel
        .find()
        .select('urn name slug status')
        .sort({ name: 1 })
        .lean<Pick<Business, 'urn' | 'name' | 'slug' | 'status'>[]>()
        .exec(),
      this.locationModel
        .find()
        .select('urn title businessUrn')
        .sort({ title: 1 })
        .lean<Pick<Location, 'urn' | 'title' | 'businessUrn'>[]>()
        .exec(),
    ]);

    return businesses.map((business) => ({
      urn: business.urn,
      name: business.name,
      slug: business.slug,
      status: business.status,
      locations: locations
        .filter((location) => location.businessUrn === business.urn)
        .map((location) => ({ urn: location.urn, title: location.title })),
    }));
  }
}
