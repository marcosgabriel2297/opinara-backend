import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { Errors } from '@shared/common/errors';
import { Exceptions } from '@shared/common/exceptions';
import { ALLOW_PENDING_PASSWORD_CHANGE } from '@shared/common/guards';
import { JwtPayload, TokenType } from '@shared/common/interfaces';

import { AdminsRepository } from '../models';

/** El admin que hace el pedido: lo deja el `AdminGuard` y lo usa la auditoría. */
export interface AuthenticatedAdmin {
  urn: string;
  email: string;
}

interface AdminRequest extends Request {
  admin?: AuthenticatedAdmin;
}

/**
 * Valida el token del administrador. Como el `AuthGuard` con los usuarios, consulta la base en
 * cada request: un admin desactivado pierde el acceso en el acto aunque su token no haya vencido.
 *
 * Además:
 * - un token emitido antes del último cambio de contraseña ya no sirve (`pv` distinto de
 *   `passwordVersion`: el admin no tiene sesiones que revocar);
 * - con la contraseña provisoria del alta, solo pasan los endpoints marcados con
 *   `@AllowPendingPasswordChange()`, como con los usuarios.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly adminsRepository: AdminsRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    let payload: JwtPayload & { pv?: number };
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload & { pv?: number }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'),
      });
    } catch {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    const admin = payload.type === TokenType.ADMIN ? await this.adminsRepository.findActiveByUrn(payload.sub) : null;
    if (!admin) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    if ((payload.pv ?? 0) !== (admin.passwordVersion ?? 0)) {
      return Exceptions.unauthorized(Errors.UNAUTHORIZED);
    }

    const allowsPending =
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (admin.mustChangePassword && !allowsPending) {
      return Exceptions.forbidden(Errors.PASSWORD_CHANGE_REQUIRED);
    }

    request.admin = { urn: admin.urn, email: admin.email };
    return true;
  }
}

/** Protege un endpoint con el token del administrador. */
export function AdminAuth() {
  return applyDecorators(UseGuards(AdminGuard));
}

/** El admin autenticado. Solo válido en endpoints con `@AdminAuth()`. */
export const GetAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
  const admin = ctx.switchToHttp().getRequest<AdminRequest>().admin;
  if (!admin) {
    return Exceptions.unauthorized(Errors.UNAUTHORIZED);
  }
  return admin;
});
