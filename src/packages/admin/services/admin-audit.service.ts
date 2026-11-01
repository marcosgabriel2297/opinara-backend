import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Paginated, paginate } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';

import * as DTO from '../dtos';
import { AuthenticatedAdmin } from '../guards';
import {
  AUDIT_EVENT_ENTITY,
  AuditAction,
  AuditEvent,
  AuditTargetType,
  PublicAuditEvent,
  toPublicAuditEvent,
} from '../models';

export interface AuditTarget {
  type: AuditTargetType;
  urn: string;
  label: string;
}

/** El registro de auditoría del panel: lo escriben las acciones del admin y lo lee la pantalla. */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(@InjectModel(AuditEvent.name) private readonly model: Model<AuditEvent>) {}

  /**
   * Anota una acción ya hecha. Si no se puede escribir, la acción no se deshace (ya pasó): queda
   * en el log del servidor para no perder el rastro.
   */
  async record(admin: AuthenticatedAdmin, action: AuditAction, target: AuditTarget): Promise<void> {
    try {
      await this.model.create({
        urn: Urn.createUUID(AUDIT_EVENT_ENTITY),
        adminUrn: admin.urn,
        adminEmail: admin.email,
        action,
        targetType: target.type,
        targetUrn: target.urn,
        targetLabel: target.label,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar ${action} de ${admin.urn} sobre ${target.urn}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async list(dto: DTO.ListAudit): Promise<Paginated<PublicAuditEvent>> {
    const page = dto.page ?? 0;
    const limit = dto.limit ?? DTO.ADMIN_DEFAULT_PAGE_SIZE;
    const filter: FilterQuery<AuditEvent> = {};
    if (dto.action) filter.action = dto.action;
    if (dto.adminUrn) filter.adminUrn = dto.adminUrn;
    if (dto.targetUrn) filter.targetUrn = dto.targetUrn;

    const [events, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean<AuditEvent[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return paginate(events.map(toPublicAuditEvent), page, limit, total);
  }
}
