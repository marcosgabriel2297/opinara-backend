import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

const THROTTLE_KEY_PARAMS = 'opinara:throttle-key-params';

/**
 * El limite de la ruta se cuenta por IP **y** por estos parametros de la URL, no solo por IP.
 *
 * Lo usa el QR publico: todos los telefonos del wifi de un local salen por la misma IP, y con un
 * cupo solo por IP un local lleno se quedaba sin escaneos (y le quitaba cupo a los otros QR).
 */
export const ThrottleKeyParams = (...params: string[]) => SetMetadata(THROTTLE_KEY_PARAMS, params);

/** El `ThrottlerGuard` global, con el soporte de `ThrottleKeyParams`. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const params = this.reflector.getAllAndOverride<string[] | undefined>(THROTTLE_KEY_PARAMS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (params === undefined || params.length === 0) return super.generateKey(context, suffix, name);

    const values = context.switchToHttp().getRequest<Request>().params;
    const scope = params.map((param) => String(values[param] ?? '')).join('/');
    return super.generateKey(context, `${suffix}|${scope}`, name);
  }
}
