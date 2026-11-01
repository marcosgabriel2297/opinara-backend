import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { Paginated, TokenType, paginate } from '@shared/common/interfaces';
import { comparePassword, generatePassword, hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { Business, BusinessMember } from '@shared/models/business';
import { SessionsRepository } from '@shared/models/session';
import { BusinessMemberRole, BusinessMemberStatus } from '@shared/models/enums/business';
import { UserStatus } from '@shared/models/enums/user';
import { PublicUser, USER_ENTITY, User, UsersRepository, toPublicUser } from '@shared/models/user';
import { escapeRegex, isDuplicateKeyError } from '@shared/utils';

import config from '../config';
import * as DTO from '../dtos';
import { AdminsRepository, PublicAdmin, toPublicAdmin } from '../models';

export interface AdminSession {
  admin: PublicAdmin;
  accessToken: string;
  expiresIn: number;
}

export interface CreatedUser {
  user: PublicUser;
  /** Se muestra una sola vez: el admin se la pasa al usuario, que la cambia al entrar. */
  temporaryPassword: string;
}

export interface AdminUser extends PublicUser {
  /** Los negocios donde es miembro activo, con su rol. */
  businesses: { urn: string; name: string; role: BusinessMemberRole }[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly adminsRepository: AdminsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(BusinessMember.name) private readonly memberModel: Model<BusinessMember>,
    @InjectModel(Business.name) private readonly businessModel: Model<Business>,
  ) {}

  async login(payload: DTO.Login): Promise<AdminSession> {
    const admin = await this.adminsRepository.findByEmailWithPassword(payload.email);
    const matches = await comparePassword(payload.password, admin?.password);

    // Mismo error para email inexistente, password incorrecto o admin inactivo.
    if (!admin || !matches || admin.status !== UserStatus.ACTIVE) {
      return Exceptions.unauthorized(Errors.WRONG_CREDENTIALS);
    }

    const accessToken = await this.jwtService.signAsync(
      { sub: admin.urn, email: admin.email, type: TokenType.ADMIN },
      { secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'), expiresIn: config.Token.ExpiresIn },
    );

    return { admin: toPublicAdmin(admin), accessToken, expiresIn: config.Token.ExpiresIn };
  }

  /** Da de alta un usuario con una contraseña provisoria que tiene que cambiar al primer inicio de sesion. */
  async createUser(payload: DTO.CreateUser): Promise<CreatedUser> {
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
  async resetTemporaryPassword(userUrn: string): Promise<CreatedUser> {
    const temporaryPassword = generatePassword();
    const user = await this.usersRepository.updateOne(
      { urn: userUrn },
      { $set: { password: await hashPassword(temporaryPassword), mustChangePassword: true } },
    );
    if (!user) {
      return Exceptions.notFound(Errors.USER_NOT_FOUND);
    }

    await this.sessionsRepository.revokeAllForUser(userUrn);

    return { user: toPublicUser(user), temporaryPassword };
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
