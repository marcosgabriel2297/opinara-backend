import { CanActivate, ExecutionContext, Injectable, UseGuards, applyDecorators } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { JwtPayload, TokenType } from '@shared/common/interfaces';

import { AdminsRepository } from '../models';

/**
 * Valida el token del administrador. Como el `AuthGuard` con los usuarios, consulta la base en
 * cada request: un admin desactivado pierde el acceso en el acto aunque su token no haya vencido.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly adminsRepository: AdminsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
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

    if (payload.type !== TokenType.ADMIN || !(await this.adminsRepository.findActiveByUrn(payload.sub))) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    return true;
  }
}

/** Protege un endpoint con el token del administrador. */
export function AdminAuth() {
  return applyDecorators(UseGuards(AdminGuard));
}
