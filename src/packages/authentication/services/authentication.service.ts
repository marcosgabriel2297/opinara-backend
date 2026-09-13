import { createHash } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { JwtPayload, TokenType } from '@shared/common/interfaces';
import { Urn } from '@shared/common/urn';
import { UserStatus } from '@shared/models/enums/user';
import { PublicUser, USER_ENTITY, User, UsersRepository, toPublicUser } from '@shared/models/user';
import { isDuplicateKeyError } from '@shared/utils';

import config from '../config';
import * as DTO from '../dtos';
import { Session } from '../interfaces';

/**
 * Hash descartable con el que se compara cuando el email no existe, para que el login
 * tarde lo mismo con un email valido que con uno inexistente (evita enumeracion por timing).
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7tAP8Xm1VDrCDwvXiSmQbGgqQnhq8Vu';

/**
 * bcrypt trunca silenciosamente a 72 bytes: sin esto, dos passwords que comparten los
 * primeros 72 bytes serian intercambiables al iniciar sesion. Pre-hashear con SHA-256 deja
 * siempre 44 caracteres, sin limite de longitud para el usuario.
 */
const prepare = (password: string): string => createHash('sha256').update(password, 'utf8').digest('base64');

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(payload: DTO.Register): Promise<Session> {
    const email = payload.email.toLowerCase().trim();

    if (await this.usersRepository.findByEmail(email)) {
      Exceptions.conflict(Errors.EMAIL_ALREADY_EXISTS);
    }

    try {
      const user = await this.usersRepository.createOrUpdate({
        urn: Urn.createUUID(USER_ENTITY),
        email,
        name: payload.name.trim(),
        password: await bcrypt.hash(prepare(payload.password), config.Password.SaltRounds),
        status: UserStatus.ACTIVE,
      });

      return await this.buildSession(user);
    } catch (error) {
      // Dos registros concurrentes pasan el chequeo de arriba; el indice unico frena al segundo.
      if (isDuplicateKeyError(error)) {
        Exceptions.conflict(Errors.EMAIL_ALREADY_EXISTS);
      }

      throw error;
    }
  }

  async login(payload: DTO.Login): Promise<Session> {
    const user = await this.usersRepository.findByEmailWithPassword(payload.email);
    const matches = await bcrypt.compare(prepare(payload.password), user?.password ?? DUMMY_HASH);

    // Mismo error para email inexistente y password incorrecto: no confirmamos si el email existe.
    if (!user || !matches) {
      Exceptions.unauthorized(Errors.WRONG_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      Exceptions.forbidden(Errors.USER_INACTIVE);
    }

    return this.buildSession(user);
  }

  async refresh(payload: DTO.Refresh): Promise<Session> {
    let claims: JwtPayload;
    try {
      claims = await this.jwtService.verifyAsync<JwtPayload>(payload.refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      return Exceptions.unauthorized(Errors.INVALID_REFRESH_TOKEN);
    }

    if (claims.type !== TokenType.REFRESH) {
      Exceptions.unauthorized(Errors.INVALID_REFRESH_TOKEN);
    }

    const user = await this.usersRepository.one(claims.sub);
    if (!user) {
      Exceptions.unauthorized(Errors.INVALID_REFRESH_TOKEN);
    }

    if (user.status !== UserStatus.ACTIVE) {
      Exceptions.forbidden(Errors.USER_INACTIVE);
    }

    return this.buildSession(user);
  }

  async me(urn: string): Promise<PublicUser> {
    const user = await this.usersRepository.one(urn);
    if (!user) {
      Exceptions.notFound(Errors.USER_NOT_FOUND);
    }

    return toPublicUser(user);
  }

  private async buildSession(user: User): Promise<Session> {
    const claims = { sub: user.urn, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...claims, type: TokenType.ACCESS },
        { secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'), expiresIn: config.Token.AccessExpiresIn },
      ),
      this.jwtService.signAsync(
        { ...claims, type: TokenType.REFRESH },
        { secret: this.refreshSecret(), expiresIn: config.Token.RefreshExpiresIn },
      ),
    ]);

    return { user: toPublicUser(user), accessToken, refreshToken, expiresIn: config.Token.AccessExpiresIn };
  }

  /** El refresh usa su propio secreto; si no se configura, cae al secreto principal. */
  private refreshSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET_KEY') ??
      this.configService.getOrThrow<string>('JWT_SECRET_KEY')
    );
  }
}
