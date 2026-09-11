import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { REQUIRED_ROLES } from './roles.decorator';
import type { AuthenticatedUserRequest } from './admin-auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateAdminAccessState,
  isActiveAdminState,
} from '../subscriptions/admin-access.policy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined) return true;
    const user = context
      .switchToHttp()
      .getRequest<AuthenticatedUserRequest>().user;
    const databaseUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { adminEntitlement: true },
    });
    if (databaseUser === null) throw new ForbiddenException();
    if (
      databaseUser.role === 'SUPER_ADMIN' &&
      required.includes(databaseUser.role)
    ) {
      return true;
    }
    const now = new Date();
    const state = calculateAdminAccessState(
      databaseUser.role,
      databaseUser.adminEntitlement,
      now,
    );
    if (required.includes('ADMIN') && isActiveAdminState(state)) {
      return true;
    }
    if (
      required.includes('ADMIN') &&
      context.switchToHttp().getRequest().method === 'GET' &&
      state === 'EXPIRED_READ_ONLY'
    ) {
      return true;
    }
    throw new ForbiddenException({
      code: databaseUser.adminEntitlement
        ? 'ADMIN_SUBSCRIPTION_EXPIRED'
        : 'ADMIN_SUBSCRIPTION_REQUIRED',
    });
  }
}
