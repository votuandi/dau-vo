import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityNormalizationService } from '../auth/identity-normalization.service';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
@Injectable()
export class SuperAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IdentityNormalizationService)
    private readonly identities: IdentityNormalizationService,
  ) {}
  async list(query: {
    page?: number;
    search?: string;
    role?: UserRole;
    active?: string;
  }) {
    const page = Math.max(1, query.page ?? 1),
      take = 25;
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.active === undefined
        ? {}
        : { isActive: query.active === 'true' }),
      ...(search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          organization: true,
          role: true,
          isActive: true,
          deletedAt: true,
          createdAt: true,
          adminEntitlement: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page, pageSize: take, total };
  }
  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        organization: true,
        role: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        adminEntitlement: true,
        ownedTournaments: { select: { id: true, name: true, softDeletedAt: true, purgeAfter: true, deletionReason: true, restoredAt: true }, orderBy: { createdAt: 'desc' } },
        subscriptionOrders: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!user) throw new NotFoundException();
    return user;
  }
  async create(
    input: {
      username: string;
      fullName: string;
      email: string;
      phone: string;
      password: string;
      organization?: string;
      role?: UserRole;
    },
    actor: AuthenticatedUser,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: input.username.trim(),
            normalizedUsername: this.identities.username(input.username),
            fullName: input.fullName.trim(),
            email: input.email.trim(),
            normalizedEmail: this.identities.email(input.email),
            phone: input.phone.trim(),
            normalizedPhone: this.identities.phone(input.phone),
            organization: input.organization?.trim() || null,
            passwordHash: await hash(input.password, 12),
            role: input.role ?? UserRole.USER,
            isActive: true,
          },
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
            isActive: true,
          },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actor.id,
            eventType: 'ADMIN_ACTION',
            metadata: {
              action: 'SUPER_ADMIN_USER_CREATED',
              targetUserId: user.id,
            },
          },
        });
        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({ code: 'DUPLICATE_IDENTITY' });
      throw error;
    }
  }
  async update(
    id: string,
    input: {
      fullName?: string;
      email?: string;
      phone?: string;
      organization?: string;
      role?: UserRole;
      isActive?: boolean;
      deleted?: boolean;
      reason?: string;
    },
    actor: AuthenticatedUser,
  ) {
    const before = await this.detail(id);
    if (
      id === actor.id &&
      (input.isActive === false ||
        input.deleted ||
        (input.role !== undefined && input.role !== UserRole.SUPER_ADMIN))
    )
      throw new ForbiddenException({ code: 'CANNOT_MODIFY_SELF' });
    if (
      before.role === UserRole.SUPER_ADMIN &&
      ((input.role !== undefined && input.role !== UserRole.SUPER_ADMIN) ||
        input.isActive === false ||
        input.deleted)
    ) {
      const count = await this.prisma.user.count({
        where: { role: UserRole.SUPER_ADMIN, isActive: true, deletedAt: null },
      });
      if (count <= 1) throw new ConflictException({ code: 'LAST_SUPER_ADMIN' });
    }
    const data: Prisma.UserUpdateInput = {
      ...(input.fullName !== undefined
        ? { fullName: input.fullName.trim() }
        : {}),
      ...(input.organization !== undefined
        ? { organization: input.organization.trim() || null }
        : {}),
      ...(input.email !== undefined
        ? {
            email: input.email.trim(),
            normalizedEmail: this.identities.email(input.email),
          }
        : {}),
      ...(input.phone !== undefined
        ? {
            phone: input.phone.trim(),
            normalizedPhone: this.identities.phone(input.phone),
          }
        : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.deleted ? { deletedAt: new Date(), isActive: false } : {}),
    };
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data,
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            deletedAt: true,
          },
        });
        await tx.auditLog.create({
          data: {
            adminUserId: actor.id,
            eventType: 'ADMIN_ACTION',
            metadata: {
              action: 'SUPER_ADMIN_USER_UPDATED',
              targetUserId: id,
              reason: input.reason ?? null,
              before,
              after: user,
            },
          },
        });
        return user;
      });
      return result;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException({ code: 'DUPLICATE_IDENTITY' });
      throw e;
    }
  }
  async access(
    id: string,
    input: {
      action: 'ACTIVATE' | 'SUSPEND' | 'REVOKE';
      activeFrom?: string;
      activeUntil?: string;
      tournamentLimit?: number;
      reason?: string;
    },
    actor: AuthenticatedUser,
  ) {
    const current = await this.prisma.adminEntitlement.findUnique({
      where: { userId: id },
    });
    const now = new Date();
    const status =
      input.action === 'ACTIVATE'
        ? 'ACTIVE'
        : input.action === 'SUSPEND'
          ? 'SUSPENDED'
          : 'REVOKED';
    const from = input.activeFrom
      ? new Date(input.activeFrom)
      : (current?.activeFrom ?? now);
    const until = input.activeUntil
      ? new Date(input.activeUntil)
      : (current?.activeUntil ?? now);
    if (status === 'ACTIVE' && until <= from)
      throw new BadRequestException({ code: 'INVALID_ENTITLEMENT_PERIOD' });
    return this.prisma.$transaction(async (tx) => {
      const entitlement = await tx.adminEntitlement.upsert({
        where: { userId: id },
        create: {
          userId: id,
          status,
          activeFrom: from,
          activeUntil: until,
          tournamentLimit: input.tournamentLimit ?? 0,
        },
        update: {
          status,
          activeFrom: from,
          activeUntil: until,
          tournamentLimit:
            input.tournamentLimit ?? current?.tournamentLimit ?? 0,
          adminAccessEndedAt: status === 'ACTIVE' ? null : now,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: actor.id,
          eventType: 'ADMIN_ACTION',
          metadata: {
            action: 'SUPER_ADMIN_ENTITLEMENT',
            targetUserId: id,
            reason: input.reason ?? null,
            before: current,
            after: entitlement,
          },
        },
      });
      return entitlement;
    });
  }
}
