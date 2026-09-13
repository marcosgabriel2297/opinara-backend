import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { UsersRepository } from '@shared/models/user';
import { Errors } from '../errors';
import { Exceptions } from '../exceptions';
import { AuthenticatedUser, JwtPayload, TokenType } from '../interfaces';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Valida el access token y deja `{ urn, email }` en `request.user`.
 *
 * Ademas de verificar la firma consulta el usuario en la base: un token sigue siendo
 * criptograficamente valido despues de que la cuenta se desactiva o se borra, y sin este
 * chequeo esa cuenta conservaria acceso completo hasta que el token expire.
 *
 * Rechaza explicitamente los refresh tokens: son de mayor duracion y solo sirven
 * contra `/auth/refresh`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
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

    if (payload.type !== TokenType.ACCESS) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    const user = await this.usersRepository.findActiveByUrn(payload.sub);
    if (!user) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    request.user = { urn: user.urn, email: user.email };

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
