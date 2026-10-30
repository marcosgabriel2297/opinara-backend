import { Controller, Get, Query } from '@nestjs/common';

import * as DTO from '../dtos';
import { AdminAuth } from '../guards';
import * as Services from '../services';

/** Reportes de toda la plataforma. Solo lectura, solo con el token del administrador. */
@Controller()
@AdminAuth()
export class AdminReportsController {
  constructor(private readonly service: Services.Reports) {}

  @Get('/businesses')
  businesses() {
    return this.service.businesses();
  }

  @Get('/reviews')
  reviews(@Query() query: DTO.ListReviews) {
    return this.service.listReviews(query);
  }

  /** Mismos filtros que el listado: las cifras de lo que se esta viendo. */
  @Get('/reviews/summary')
  reviewsSummary(@Query() query: DTO.ReviewFilters) {
    return this.service.reviewsSummary(query);
  }
}
