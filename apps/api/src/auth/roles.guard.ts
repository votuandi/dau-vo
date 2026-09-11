import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { REQUIRED_ROLES } from './roles.decorator';
import type { AuthenticatedUserRequest } from './admin-auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    if (required === undefined) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedUserRequest>().user;
    if (required.includes(user.role)) return true;
    throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED', message: 'Administrator access required' });
  }
}
