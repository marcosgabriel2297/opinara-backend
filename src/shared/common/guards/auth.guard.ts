import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { SessionsRepository } from '@shared/models/session';
import { UsersRepository } from '@shared/models/user';
import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AuthenticatedUser, JwtPayload, TokenType } from '../interfaces';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Metadata de `@AllowPendingPasswordChange()`. */
export const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

/**
 * Valida el access token y deja `{ urn, email }` en `request.user`.
 *
 * Ademas de verificar la firma consulta el usuario en la base: un token sigue siendo
 * criptograficamente valido despues de que la cuenta se desactiva o se borra, y sin este
 * chequeo esa cuenta conservaria acceso completo hasta que el token expire.
 *
 * Tambien consulta la sesion (`sid`): al cerrar sesion se revoca, y el token deja de servir en el
 * acto aunque no haya vencido.
 *
 * Rechaza explicitamente los refresh tokens: son de mayor duracion y solo sirven
 * contra `/auth/refresh`.
 *
 * Mientras el usuario tenga la contraseña provisoria del alta (`mustChangePassword`), solo deja
 * pasar los endpoints marcados con `@AllowPendingPasswordChange()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'),
      });
    } catch {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    if (payload.type !== TokenType.ACCESS || payload.sid === undefined) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    const [user, session] = await Promise.all([
      this.usersRepository.findActiveByUrn(payload.sub),
      this.sessionsRepository.findActive(payload.sid),
    ]);
    if (!user || session?.userUrn !== user.urn) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    if (user.mustChangePassword && !this.allowsPendingPasswordChange(context)) {
      return Exceptions.forbidden(Errors.PASSWORD_CHANGE_REQUIRED);
    }

    request.user = { urn: user.urn, email: user.email, sessionUrn: session.urn };

    return true;
  }

  private allowsPendingPasswordChange(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
