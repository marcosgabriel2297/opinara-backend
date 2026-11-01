import { Controller, Get, Query } from '@nestjs/common';

import * as DTO from '../dtos';
import { AdminAuth } from '../guards';
import * as Services from '../services';

/** Reportes de toda la plataforma. Solo lectura, solo con el token del administrador. */
@Controller()
@AdminAuth()
export class AdminReportsController {
  constructor(
    private readonly service: Services.Reports,
    private readonly stats: Services.Stats,
    private readonly auditService: Services.Audit,
    private readonly scans: Services.Scans,
  ) {}

  /** La pantalla de inicio del panel: totales y evolución por semana. */
  @Get('/stats/overview')
  overview(@Query() query: DTO.Overview) {
    return this.stats.overview(query);
  }

  /** Escaneos por semana y ranking de campañas, de toda la plataforma o filtrados. */
  @Get('/scans')
  scansReport(@Query() query: DTO.Scans) {
    return this.scans.report(query);
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

  /** El registro de auditoría: lo que hicieron los admins, lo más nuevo primero. */
  @Get('/audit')
  audit(@Query() query: DTO.ListAudit) {
    return this.auditService.list(query);
  }
}
