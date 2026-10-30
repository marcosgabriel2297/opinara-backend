import { createHash, randomBytes } from 'crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import SharedConfig from '@shared/config';
import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { AuthenticatedUser, JwtPayload, TokenType } from '@shared/common/interfaces';
import { MAILER, Mailer, actionMail } from '@shared/common/mailer';
import { comparePassword, hashPassword } from '@shared/common/password';
import { Urn } from '@shared/common/urn';
import { UserStatus } from '@shared/models/enums/user';
import { SESSION_ENTITY, SessionsRepository } from '@shared/models/session';
import { PublicUser, User, UsersRepository, toPublicUser } from '@shared/models/user';

import config from '../config';
import * as DTO from '../dtos';
import { Session } from '../interfaces';
import { PasswordResetsRepository } from '../models';

/** Los tokens de un solo uso (recuperar contraseña) se guardan hasheados. */
const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly passwordResetsRepository: PasswordResetsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async login(payload: DTO.Login): Promise<Session> {
    const user = await this.usersRepository.findByEmailWithPassword(payload.email);
    const matches = await comparePassword(payload.password, user?.password);

    // Mismo error para email inexistente y password incorrecto: no confirmamos si el email existe.
    if (!user || !matches) {
      Exceptions.unauthorized(Errors.WRONG_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      Exceptions.forbidden(Errors.USER_INACTIVE);
    }

    return this.buildSession(user);
  }

  /**
   * Un refresh token sirve mientras su sesion este vigente: al cerrar sesion (o cambiar la
   * contraseña) se revoca y deja de servir aunque el token no haya vencido.
   */
  async refresh(payload: DTO.Refresh): Promise<Session> {
    const claims = await this.verifyRefreshToken(payload.refreshToken);
    if (claims?.sid === undefined) {
      return Exceptions.unauthorized(Errors.INVALID_REFRESH_TOKEN);
    }

    const session = await this.sessionsRepository.findActive(claims.sid);
    const user = await this.usersRepository.one(claims.sub);
    if (!user || session?.userUrn !== user.urn) {
      return Exceptions.unauthorized(Errors.INVALID_REFRESH_TOKEN);
    }

    if (user.status !== UserStatus.ACTIVE) {
      Exceptions.forbidden(Errors.USER_INACTIVE);
    }

    return this.buildSession(user, session.urn);
  }

  /**
   * Cierra la sesion de este refresh token. Responde igual si el token ya no servia: para quien
   * cierra sesion el resultado es el mismo, y no confirma nada sobre el token.
   */
  async logout(payload: DTO.Logout): Promise<void> {
    const claims = await this.verifyRefreshToken(payload.refreshToken, { ignoreExpiration: true });
    if (claims?.sid !== undefined) {
      await this.sessionsRepository.revoke(claims.sid);
    }
  }

  /** "Cerrar sesion en todos los dispositivos": la computadora del local que quedo abierta. */
  async logoutEverywhere(userUrn: string): Promise<void> {
    await this.sessionsRepository.revokeAllForUser(userUrn);
  }

  /**
   * Manda el link para elegir una contraseña nueva. Responde lo mismo exista o no la cuenta (y sin
   * esperar el envio, para no delatarla por el tiempo de respuesta).
   */
  async forgotPassword(payload: DTO.ForgotPassword): Promise<void> {
    const user = await this.usersRepository.findByEmail(payload.email.toLowerCase().trim());
    if (user?.status !== UserStatus.ACTIVE) return;

    const token = randomBytes(32).toString('base64url');
    await this.passwordResetsRepository.replace(
      user.urn,
      hashToken(token),
      new Date(Date.now() + config.PasswordReset.ExpiresInSeconds * 1000),
    );

    // El token va despues de `#`: el navegador no lo manda al servidor ni en el `Referer`.
    const url = `${SharedConfig.App.PublicAppBaseUrl}/reset-password#token=${token}`;
    const minutes = Math.round(config.PasswordReset.ExpiresInSeconds / 60);
    void this.mailer
      .send(
        actionMail({
          to: user.email,
          subject: 'Elegí una contraseña nueva para Opinara',
          paragraphs: [
            `Hola, ${user.name}.`,
            'Nos pidieron cambiar la contraseña de tu cuenta de Opinara. Si fuiste vos, elegí una nueva desde este link.',
          ],
          action: { label: 'Elegir contraseña nueva', url },
          footnote: `El link sirve una sola vez y vence en ${String(minutes)} minutos. Si no lo pediste, ignorá este mail: tu contraseña no cambia.`,
        }),
      )
      .catch((error: unknown) => {
        this.logger.error(
          `No se pudo mandar el mail de recuperacion a ${user.urn}`,
          error instanceof Error ? error.stack : undefined,
        );
      });
  }

  /** Cambia la contraseña con el link del mail y cierra todas las sesiones abiertas. */
  async resetPassword(payload: DTO.ResetPassword): Promise<void> {
    const reset = await this.passwordResetsRepository.consume(hashToken(payload.token));
    if (!reset) {
      return Exceptions.badRequest(Errors.INVALID_RESET_TOKEN);
    }

    const password = await hashPassword(payload.password);
    // Elegir contraseña desde el mail tambien reemplaza la provisoria del alta.
    const updated = await this.usersRepository.updateOne(
      { urn: reset.userUrn, status: UserStatus.ACTIVE },
      { $set: { password, mustChangePassword: false } },
    );
    if (!updated) {
      return Exceptions.badRequest(Errors.INVALID_RESET_TOKEN);
    }

    // Si alguien entro con la contraseña vieja, queda afuera.
    await this.sessionsRepository.revokeAllForUser(reset.userUrn);
  }

  /**
   * Cambia la contraseña conociendo la actual. Es lo que hace el usuario con la contraseña
   * provisoria del alta; cierra las demas sesiones y deja abierta la de este dispositivo.
   */
  async changePassword(user: AuthenticatedUser, payload: DTO.ChangePassword): Promise<void> {
    const stored = await this.usersRepository.findByUrnWithPassword(user.urn);
    if (!stored || !(await comparePassword(payload.currentPassword, stored.password))) {
      return Exceptions.badRequest(Errors.WRONG_CURRENT_PASSWORD);
    }

    if (payload.newPassword === payload.currentPassword) {
      return Exceptions.badRequest(Errors.SAME_PASSWORD);
    }

    await this.usersRepository.updateOne(
      { urn: user.urn },
      { $set: { password: await hashPassword(payload.newPassword), mustChangePassword: false } },
    );
    await this.sessionsRepository.revokeOthersForUser(user.urn, user.sessionUrn);
  }

  async me(urn: string): Promise<PublicUser> {
    const user = await this.usersRepository.one(urn);
    if (!user) {
      Exceptions.notFound(Errors.USER_NOT_FOUND);
    }

    return toPublicUser(user);
  }

  /**
   * Emite los tokens de una sesion. Sin `sessionUrn` (login) abre una nueva; con uno
   * (refresh), extiende la existente.
   */
  private async buildSession(user: User, sessionUrn?: string): Promise<Session> {
    const sid = sessionUrn ?? Urn.createUUID(SESSION_ENTITY);
    const expiresAt = new Date(Date.now() + config.Token.RefreshExpiresIn * 1000);
    await this.sessionsRepository.createOrUpdate({ urn: sid, userUrn: user.urn, expiresAt });

    const claims = { sub: user.urn, email: user.email, sid };

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

  /** Los claims de un refresh token valido, o `null`. */
  private async verifyRefreshToken(
    token: string,
    options: { ignoreExpiration?: boolean } = {},
  ): Promise<JwtPayload | null> {
    try {
      const claims = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.refreshSecret(),
        ignoreExpiration: options.ignoreExpiration ?? false,
      });
      return claims.type === TokenType.REFRESH ? claims : null;
    } catch {
      return null;
    }
  }

  /** El refresh usa su propio secreto; si no se configura, cae al secreto principal. */
  private refreshSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET_KEY') ??
      this.configService.getOrThrow<string>('JWT_SECRET_KEY')
    );
  }
}
