import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Paginated, paginate } from '@shared/common/interfaces';
import { generatePassword, hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { Business, BusinessMember } from '@shared/models/business';
import { Session, SessionsRepository } from '@shared/models/session';
import { BusinessMemberRole, BusinessMemberStatus, BusinessStatus } from '@shared/models/enums/business';
import { UserStatus } from '@shared/models/enums/user';
import { PublicUser, USER_ENTITY, User, UsersRepository, toPublicUser } from '@shared/models/user';
import { escapeRegex, isDuplicateKeyError } from '@shared/utils';

import * as DTO from '../dtos';
import { AuthenticatedAdmin } from '../guards';
import { AuditAction, AuditTargetType } from '../models';

import { AdminAuditService } from './admin-audit.service';

export interface CreatedUser {
  user: PublicUser;
  /** Se muestra una sola vez: el admin se la pasa al usuario, que la cambia al entrar. */
  temporaryPassword: string;
}

export interface AdminUser extends PublicUser {
  /** Los negocios donde es miembro activo, con su rol. */
  businesses: { urn: string; name: string; role: BusinessMemberRole }[];
}

export interface AdminUserDetail extends PublicUser {
  businesses: { urn: string; name: string; role: BusinessMemberRole; status: BusinessStatus; since: Date | null }[];
  sessions: {
    /** Abiertas ahora: sin revocar y sin vencer. */
    active: number;
    /** El último inicio de sesión (cuándo se abrió la sesión más reciente). */
    lastLoginAt: Date | null;
    /**
     * Aproximado: la última vez que la app renovó el token (lo hace al abrirse y cada tanto). No es
     * la última pantalla que vio.
     */
    lastSeenAt: Date | null;
  };
}

const userTarget = (user: Pick<User, 'urn' | 'email'>) => ({
  type: AuditTargetType.USER,
  urn: user.urn,
  label: user.email,
});

/** Los usuarios de la plataforma: listado, alta, contraseñas y desactivación. Lo que cambia, se audita. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly audit: AdminAuditService,
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    @InjectModel(BusinessMember.name) private readonly memberModel: Model<BusinessMember>,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
  ) {}

  /** Da de alta un usuario con una contraseña provisoria que tiene que cambiar al primer inicio de sesion. */
  async createUser(admin: AuthenticatedAdmin, payload: DTO.CreateUser): Promise<CreatedUser> {
    const email = payload.email.toLowerCase().trim();

    if (await this.usersRepository.findByEmail(email)) {
      Exceptions.conflict(Errors.EMAIL_ALREADY_EXISTS);
    }

    const temporaryPassword = generatePassword();
    try {
      const user = await this.usersRepository.createOrUpdate({
        urn: Urn.createUUID(USER_ENTITY),
        email,
        name: payload.name.trim(),
        password: await hashPassword(temporaryPassword),
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
      });

      await this.audit.record(admin, AuditAction.USER_CREATED, userTarget(user));
      return { user: toPublicUser(user), temporaryPassword };
    } catch (error) {
      // Dos altas concurrentes pasan el chequeo de arriba; el indice unico frena a la segunda.
      if (isDuplicateKeyError(error)) {
        Exceptions.conflict(Errors.EMAIL_ALREADY_EXISTS);
      }

      throw error;
    }
  }

  /**
   * Otra contraseña provisoria, para quien perdio la del alta (o la olvido y no le llega el mail).
   * Reemplaza la actual, obliga a cambiarla al entrar y cierra todas sus sesiones abiertas.
   */
  async resetTemporaryPassword(admin: AuthenticatedAdmin, userUrn: string): Promise<CreatedUser> {
    const temporaryPassword = generatePassword();
    const user = await this.usersRepository.updateOne(
      { urn: userUrn },
      { $set: { password: await hashPassword(temporaryPassword), mustChangePassword: true } },
    );
    if (!user) {
      return Exceptions.notFound(Errors.USER_NOT_FOUND);
    }

    await this.sessionsRepository.revokeAllForUser(userUrn);
    await this.audit.record(admin, AuditAction.USER_TEMPORARY_PASSWORD, userTarget(user));

    return { user: toPublicUser(user), temporaryPassword };
  }

  /**
   * Desactiva o reactiva una cuenta. Desactivada no puede entrar ni usar la API (el `AuthGuard`
   * lo chequea en cada request) y se cierran sus sesiones. Sus negocios siguen andando para el
   * resto del equipo. Repetir el mismo estado no cambia nada ni deja otro evento.
   */
  async setStatus(admin: AuthenticatedAdmin, userUrn: string, status: UserStatus): Promise<PublicUser> {
    const changed = await this.usersRepository.updateOne(
      { urn: userUrn, status: { $ne: status } },
      { $set: { status } },
    );
    if (!changed) {
      const current = await this.usersRepository.one(userUrn);
      return current ? toPublicUser(current) : Exceptions.notFound(Errors.USER_NOT_FOUND);
    }

    if (status === UserStatus.INACTIVE) {
      await this.sessionsRepository.revokeAllForUser(userUrn);
    }
    await this.audit.record(
      admin,
      status === UserStatus.INACTIVE ? AuditAction.USER_DEACTIVATED : AuditAction.USER_REACTIVATED,
      userTarget(changed),
    );
    return toPublicUser(changed);
  }

  /** Todo sobre un usuario: sus negocios y cuándo entró. Su historial sale de la auditoría. */
  async detail(userUrn: string, now: Date = new Date()): Promise<AdminUserDetail> {
    const user = await this.usersRepository.one(userUrn);
    if (!user) {
      return Exceptions.notFound(Errors.USER_NOT_FOUND);
    }

    const [members, active, sessions] = await Promise.all([
      this.memberModel.find({ userUrn, status: BusinessMemberStatus.ACTIVE }).lean<BusinessMember[]>().exec(),
      this.sessionModel.countDocuments({ userUrn, revokedAt: { $exists: false }, expiresAt: { $gt: now } }).exec(),
      this.sessionModel
        .aggregate<{ lastLoginAt: Date | null; lastSeenAt: Date | null }>([
          { $match: { userUrn } },
          { $group: { _id: null, lastLoginAt: { $max: '$createdAt' }, lastSeenAt: { $max: '$updatedAt' } } },
        ])
        .exec()
        .then(([row]) => row),
    ]);

    const businesses = await this.businessModel
      .find({ urn: { $in: members.map((member) => member.businessUrn) } })
      .select('urn name status')
      .lean<Pick<Business, 'urn' | 'name' | 'status'>[]>()
      .exec();
    const businessByUrn = new Map(businesses.map((business) => [business.urn, business]));

    return {
      ...toPublicUser(user),
      businesses: members.flatMap((member) => {
        const business = businessByUrn.get(member.businessUrn);
        return business
          ? [
              {
                urn: business.urn,
                name: business.name,
                role: member.role,
                status: business.status,
                since: member.createdAt ?? null,
              },
            ]
          : [];
      }),
      sessions: {
        active,
        lastLoginAt: sessions?.lastLoginAt ?? null,
        lastSeenAt: sessions?.lastSeenAt ?? null,
      },
    };
  }

  /** Los usuarios de la plataforma, el mas nuevo primero, con los negocios de cada uno. */
  async listUsers(dto: DTO.ListUsers): Promise<Paginated<AdminUser>> {
    const page = dto.page ?? 0;
    const limit = dto.limit ?? DTO.ADMIN_DEFAULT_PAGE_SIZE;
    const search = dto.search?.trim();
    const filter: FilterQuery<User> = {};
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ email: pattern }, { name: pattern }];
    }

    const [users, total] = await Promise.all([
      this.usersRepository.find(filter, { page, limit, sort: { createdAt: -1 } }),
      this.usersRepository.count(filter),
    ]);

    // Membresias y nombres de negocio en dos consultas, no una por fila.
    const members = await this.memberModel
      .find({ userUrn: { $in: users.map((user) => user.urn) }, status: BusinessMemberStatus.ACTIVE })
      .select('userUrn businessUrn role')
      .lean<Pick<BusinessMember, 'userUrn' | 'businessUrn' | 'role'>[]>()
      .exec();
    const businesses = await this.businessModel
      .find({ urn: { $in: [...new Set(members.map((member) => member.businessUrn))] } })
      .select('urn name')
      .lean<Pick<Business, 'urn' | 'name'>[]>()
      .exec();
    const nameByUrn = new Map(businesses.map((business) => [business.urn, business.name]));

    const items = users.map((user) => ({
      ...toPublicUser(user),
      businesses: members
        .filter((member) => member.userUrn === user.urn && nameByUrn.has(member.businessUrn))
        .map((member) => ({
          urn: member.businessUrn,
          name: nameByUrn.get(member.businessUrn) ?? '',
          role: member.role,
        })),
    }));

    return paginate(items, page, limit, total);
  }
}
