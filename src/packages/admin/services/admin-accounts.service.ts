import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { TokenType } from '@shared/common/interfaces';
import { comparePassword, generatePassword, hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { UserStatus } from '@shared/models/enums/user';
import { isDuplicateKeyError } from '@shared/utils';

import config from '../config';
import * as DTO from '../dtos';
import { AuthenticatedAdmin } from '../guards';
import {
  ADMIN_ENTITY,
  Admin,
  AdminsRepository,
  AuditAction,
  AuditTargetType,
  PublicAdmin,
  toPublicAdmin,
} from '../models';

import { AdminAuditService } from './admin-audit.service';

export interface AdminSession {
  admin: PublicAdmin;
  accessToken: string;
  expiresIn: number;
}

export interface CreatedAdmin {
  admin: PublicAdmin;
  /** Se muestra una sola vez: el nuevo admin la cambia al entrar. */
  temporaryPassword: string;
}

const adminTarget = (admin: Pick<Admin, 'urn' | 'email'>) => ({
  type: AuditTargetType.ADMIN,
  urn: admin.urn,
  label: admin.email,
});

/** Las cuentas de los administradores: login, la propia cuenta y el alta o baja de otros admins. */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly adminsRepository: AdminsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly audit: AdminAuditService,
  ) {}

  async login(payload: DTO.Login): Promise<AdminSession> {
    const admin = await this.adminsRepository.findByEmailWithPassword(payload.email);
    const matches = await comparePassword(payload.password, admin?.password);

    // Mismo error para email inexistente, password incorrecto o admin inactivo.
    if (!admin || !matches || admin.status !== UserStatus.ACTIVE) {
      return Exceptions.unauthorized(Errors.WRONG_CREDENTIALS);
    }

    await this.audit.record(admin, AuditAction.ADMIN_LOGIN, adminTarget(admin));
    return this.session(admin);
  }

  async me(admin: AuthenticatedAdmin): Promise<PublicAdmin> {
    const found = await this.adminsRepository.one(admin.urn);
    return found ? toPublicAdmin(found) : Exceptions.notFound(Errors.ADMIN_NOT_FOUND);
  }

  /**
   * Cambia la contraseña del admin conociendo la actual. Los tokens anteriores dejan de servir
   * (ver `passwordVersion` en el `AdminGuard`): devuelve uno nuevo para seguir en esta pestaña.
   */
  async changePassword(admin: AuthenticatedAdmin, payload: DTO.ChangePassword): Promise<AdminSession> {
    const stored = await this.adminsRepository.findByUrnWithPassword(admin.urn);
    if (!stored || !(await comparePassword(payload.currentPassword, stored.password))) {
      return Exceptions.badRequest(Errors.WRONG_CURRENT_PASSWORD);
    }
    if (payload.newPassword === payload.currentPassword) {
      return Exceptions.badRequest(Errors.SAME_PASSWORD);
    }

    const updated = await this.adminsRepository.updateOne(
      { urn: admin.urn },
      {
        $set: { password: await hashPassword(payload.newPassword), mustChangePassword: false },
        $inc: { passwordVersion: 1 },
      },
    );
    if (!updated) {
      return Exceptions.notFound(Errors.ADMIN_NOT_FOUND);
    }

    await this.audit.record(admin, AuditAction.ADMIN_PASSWORD_CHANGED, adminTarget(updated));
    return this.session(updated);
  }

  async list(): Promise<PublicAdmin[]> {
    const admins = await this.adminsRepository.find({}, { sort: { status: 1, name: 1 } });
    return admins.map(toPublicAdmin);
  }

  /** Otro admin, con contraseña provisoria: hasta cambiarla, el `AdminGuard` solo le deja hacer eso. */
  async create(admin: AuthenticatedAdmin, payload: DTO.CreateAdmin): Promise<CreatedAdmin> {
    const email = payload.email.toLowerCase().trim();
    const temporaryPassword = generatePassword();

    try {
      const created = await this.adminsRepository.createOrUpdate({
        urn: Urn.createUUID(ADMIN_ENTITY),
        email,
        name: payload.name.trim(),
        password: await hashPassword(temporaryPassword),
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
      });

      await this.audit.record(admin, AuditAction.ADMIN_CREATED, adminTarget(created));
      return { admin: toPublicAdmin(created), temporaryPassword };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return Exceptions.conflict(Errors.EMAIL_ALREADY_EXISTS);
      }
      throw error;
    }
  }

  /**
   * Desactiva o reactiva otro admin. Desactivado, su token deja de servir en el acto. Nadie se
   * desactiva a sí mismo: así siempre queda al menos un admin activo.
   */
  async setStatus(admin: AuthenticatedAdmin, adminUrn: string, status: UserStatus): Promise<PublicAdmin> {
    if (adminUrn === admin.urn && status === UserStatus.INACTIVE) {
      return Exceptions.badRequest(Errors.CANNOT_DEACTIVATE_SELF);
    }

    const changed = await this.adminsRepository.updateOne(
      { urn: adminUrn, status: { $ne: status } },
      { $set: { status } },
    );
    if (!changed) {
      const current = await this.adminsRepository.one(adminUrn);
      return current ? toPublicAdmin(current) : Exceptions.notFound(Errors.ADMIN_NOT_FOUND);
    }

    await this.audit.record(
      admin,
      status === UserStatus.INACTIVE ? AuditAction.ADMIN_DEACTIVATED : AuditAction.ADMIN_REACTIVATED,
      adminTarget(changed),
    );
    return toPublicAdmin(changed);
  }

  private async session(admin: Admin): Promise<AdminSession> {
    const accessToken = await this.jwtService.signAsync(
      { sub: admin.urn, email: admin.email, type: TokenType.ADMIN, pv: admin.passwordVersion ?? 0 },
      { secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'), expiresIn: config.Token.ExpiresIn },
    );
    return { admin: toPublicAdmin(admin), accessToken, expiresIn: config.Token.ExpiresIn };
  }
}
