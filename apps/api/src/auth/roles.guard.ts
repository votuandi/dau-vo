import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { REQUIRED_ROLES } from './roles.decorator';
import type { AuthenticatedUserRequest } from './admin-auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { addUtcMonths } from '../subscriptions/subscriptions.service';

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
    if (!required.includes(user.role))
      throw new ForbiddenException({
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Administrator access required',
      });
    if (user.role === 'SUPER_ADMIN') return true;
    const entitlement = await this.prisma.adminEntitlement.findUnique({
      where: { userId: user.id },
    });
    const now = new Date();
    if (
      entitlement?.status === 'ACTIVE' &&
      entitlement.activeFrom <= now &&
      now < entitlement.activeUntil
    )
      return true;
    // Former administrators retain owner-only GET access through their calendar grace period.
    const endedAt = entitlement?.adminAccessEndedAt ?? entitlement?.activeUntil;
    if (
      context.switchToHttp().getRequest().method === 'GET' &&
      endedAt !== undefined &&
      endedAt !== null &&
      now < addUtcMonths(endedAt, 12)
    )
      return true;
    throw new ForbiddenException({
      code: entitlement
        ? 'ADMIN_SUBSCRIPTION_EXPIRED'
        : 'ADMIN_SUBSCRIPTION_REQUIRED',
    });
  }
}
