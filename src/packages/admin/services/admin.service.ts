import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { TokenType } from '@shared/common/interfaces';
import { comparePassword, generatePassword, hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { UserStatus } from '@shared/models/enums/user';
import { PublicUser, USER_ENTITY, UsersRepository, toPublicUser } from '@shared/models/user';
import { isDuplicateKeyError } from '@shared/utils';

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

@Injectable()
export class AdminService {
  constructor(
    private readonly adminsRepository: AdminsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
}
