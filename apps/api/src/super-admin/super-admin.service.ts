import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminEntitlementStatus, Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityNormalizationService } from '../auth/identity-normalization.service';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
import {
  passwordValidationCode,
  passwordValidationMessage,
} from '../auth/password-policy';
import type {
  AdminAccessDto,
  CreateSuperAdminUserDto,
  ListSuperAdminUsersDto,
  UpdateSuperAdminUserDto,
} from './dto/user-management.dto';
const select = {
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
  subscriptionOrders: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      durationMonthsGranted: true,
      tournamentLimitGranted: true,
      totalAmountVnd: true,
      paymentStatus: true,
    },
  },
  ownedTournaments: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      status: true,
      softDeletedAt: true,
      purgeAfter: true,
      deletionReason: true,
      restoredAt: true,
    },
  },
} satisfies Prisma.UserSelect;
type Safe = Prisma.UserGetPayload<{ select: typeof select }>;
@Injectable()
export class SuperAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IdentityNormalizationService)
    private readonly identities: IdentityNormalizationService,
  ) {}
  async list(q: ListSuperAdminUsersDto) {
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 25,
      s = q.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.activeStatus ? { isActive: q.activeStatus === 'ACTIVE' } : {}),
      ...(q.deletedStatus === 'ONLY'
        ? { deletedAt: { not: null } }
        : q.deletedStatus === 'INCLUDE'
          ? {}
          : { deletedAt: null }),
      ...(q.entitlementStatus === 'NONE'
        ? { adminEntitlement: null }
        : q.entitlementStatus
          ? {
              adminEntitlement: {
                is: { status: q.entitlementStatus as AdminEntitlementStatus },
              },
            }
          : {}),
      ...(s
        ? {
            OR: ['username', 'fullName', 'email', 'phone'].map((field) => ({
              [field]: { contains: s, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
  async detail(id: string): Promise<Safe> {
    const user = await this.prisma.user.findUnique({ where: { id }, select });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    return user;
  }
  async create(i: CreateSuperAdminUserDto, a: AuthenticatedUser) {
    const passwordCode = passwordValidationCode(i.password);
    if (passwordCode !== null)
      throw new BadRequestException({
        code: passwordCode,
        message: passwordValidationMessage(passwordCode),
      });
    if (!this.phone(i.phone))
      throw new BadRequestException({ code: 'INVALID_PHONE' });
    const initialAccess = i.initialAdminAccess;
    const activeFrom = initialAccess?.activeFrom
      ? new Date(initialAccess.activeFrom)
      : new Date();
    const activeUntil = initialAccess
      ? new Date(initialAccess.activeUntil)
      : undefined;
    if (
      initialAccess &&
      (!Number.isFinite(activeFrom.getTime()) ||
        !Number.isFinite(activeUntil?.getTime()) ||
        activeUntil! <= activeFrom)
    )
      throw new BadRequestException({ code: 'INVALID_ENTITLEMENT_PERIOD' });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: i.username.trim(),
            normalizedUsername: this.identities.username(i.username),
            fullName: i.fullName.trim(),
            email: i.email.trim(),
            normalizedEmail: this.identities.email(i.email),
            phone: i.phone.trim(),
            normalizedPhone: this.identities.phone(i.phone),
            organization: i.organization?.trim() || null,
            passwordHash: await hash(i.password, 12),
            // This endpoint deliberately has no client-controlled role.  An
            // initial entitlement is the only supported path to ADMIN.
            role: initialAccess ? UserRole.ADMIN : UserRole.USER,
          },
          select,
        });
        if (initialAccess)
          await tx.adminEntitlement.create({
            data: {
              userId: user.id,
              status: AdminEntitlementStatus.ACTIVE,
              activeFrom,
              activeUntil: activeUntil!,
              tournamentLimit: initialAccess.tournamentLimit,
            },
          });
        const created = initialAccess
          ? await tx.user.findUniqueOrThrow({ where: { id: user.id }, select })
          : user;
        await this.audit(
          tx,
          a.id,
          'SUPER_ADMIN_USER_CREATED',
          created.id,
          null,
          created,
        );
        return created;
      });
    } catch (e) {
      this.unique(e);
    }
  }
  async update(id: string, i: UpdateSuperAdminUserDto, a: AuthenticatedUser) {
    if (i.phone !== undefined && !this.phone(i.phone))
      throw new BadRequestException({ code: 'INVALID_PHONE' });
    return this.mutate(
      id,
      a,
      'SUPER_ADMIN_USER_UPDATED',
      i.reason,
      async (tx, before) => {
        if (id === a.id && i.isActive === false)
          throw new ForbiddenException({ code: 'CANNOT_MODIFY_SELF' });
        if (before.role === UserRole.SUPER_ADMIN && i.isActive === false)
          await this.canRemove(tx);
        return tx.user.update({
          where: { id },
          data: {
            ...(i.username !== undefined
              ? {
                  username: i.username.trim(),
                  normalizedUsername: this.identities.username(i.username),
                }
              : {}),
            ...(i.fullName !== undefined
              ? { fullName: i.fullName.trim() }
              : {}),
            ...(i.email !== undefined
              ? {
                  email: i.email.trim(),
                  normalizedEmail: this.identities.email(i.email),
                }
              : {}),
            ...(i.phone !== undefined
              ? {
                  phone: i.phone.trim(),
                  normalizedPhone: this.identities.phone(i.phone),
                }
              : {}),
            ...(i.organization !== undefined
              ? { organization: i.organization.trim() || null }
              : {}),
            ...(i.isActive !== undefined ? { isActive: i.isActive } : {}),
          },
          select,
        });
      },
    );
  }
  async remove(id: string, reason: string | undefined, a: AuthenticatedUser) {
    return this.mutate(
      id,
      a,
      'SUPER_ADMIN_USER_SOFT_DELETED',
      reason,
      async (tx, before) => {
        if (id === a.id)
          throw new ForbiddenException({ code: 'CANNOT_MODIFY_SELF' });
        if (before.role === UserRole.SUPER_ADMIN) await this.canRemove(tx);
        await tx.adminEntitlement.updateMany({
          where: { userId: id, status: AdminEntitlementStatus.ACTIVE },
          data: {
            status: AdminEntitlementStatus.REVOKED,
            adminAccessEndedAt: new Date(),
          },
        });
        return tx.user.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
          select,
        });
      },
    );
  }
  async restore(id: string, reason: string | undefined, a: AuthenticatedUser) {
    return this.mutate(id, a, 'SUPER_ADMIN_USER_RESTORED', reason, (tx) =>
      tx.user.update({
        where: { id },
        data: { deletedAt: null, isActive: false },
        select,
      }),
    );
  }
  async access(id: string, i: AdminAccessDto, a: AuthenticatedUser) {
    return this.mutate(
      id,
      a,
      'SUPER_ADMIN_ADMIN_ACCESS_CHANGED',
      i.reason,
      async (tx, user) => {
        if (user.deletedAt !== null)
          throw new ConflictException({ code: 'USER_DELETED' });
        if (user.role === UserRole.SUPER_ADMIN)
          throw new ForbiddenException({
            code: 'CANNOT_CHANGE_SUPER_ADMIN_ENTITLEMENT',
          });
        const current = await tx.adminEntitlement.findUnique({
            where: { userId: id },
          }),
          now = new Date();
        if (!current && i.action !== 'ACTIVATE')
          throw new BadRequestException({ code: 'ENTITLEMENT_NOT_FOUND' });
        const from = i.activeFrom
            ? new Date(i.activeFrom)
            : (current?.activeFrom ?? now),
          until = i.activeUntil
            ? new Date(i.activeUntil)
            : current?.activeUntil;
        if (
          (i.action === 'ACTIVATE' || i.action === 'ADJUST') &&
          (!until ||
            until <= from ||
            (i.tournamentLimit === undefined && !current))
        )
          throw new BadRequestException({ code: 'INVALID_ENTITLEMENT_PERIOD' });
        if (i.action === 'ACTIVATE' && until! <= now)
          throw new BadRequestException({ code: 'INVALID_ENTITLEMENT_PERIOD' });
        const status =
          i.action === 'ACTIVATE'
            ? AdminEntitlementStatus.ACTIVE
            : i.action === 'SUSPEND'
              ? AdminEntitlementStatus.SUSPENDED
              : i.action === 'REVOKE'
                ? AdminEntitlementStatus.REVOKED
                : current!.status;
        const entitlement = await tx.adminEntitlement.upsert({
          where: { userId: id },
          create: {
            userId: id,
            status,
            activeFrom: from,
            activeUntil: until!,
            // Prisma validates both branches of upsert.  A suspension/revocation
            // has no quota payload, but still needs a concrete create branch even
            // though the earlier state check guarantees an entitlement exists.
            tournamentLimit: i.tournamentLimit ?? current?.tournamentLimit ?? 0,
            adminAccessEndedAt:
              status === AdminEntitlementStatus.ACTIVE ? null : now,
          },
          update: {
            status,
            activeFrom: from,
            activeUntil: until,
            tournamentLimit: i.tournamentLimit ?? current!.tournamentLimit,
            adminAccessEndedAt:
              status === AdminEntitlementStatus.ACTIVE ? null : now,
          },
        });
        if (i.action === 'ACTIVATE')
          await tx.user.update({
            where: { id },
            data: { role: UserRole.ADMIN, isActive: true },
          });
        if (i.action === 'REVOKE' && user.role === UserRole.ADMIN)
          await tx.user.update({
            where: { id },
            data: { role: UserRole.USER },
          });
        return {
          user: await tx.user.findUniqueOrThrow({ where: { id }, select }),
          entitlement,
        };
      },
    );
  }
  private async mutate<T>(
    id: string,
    a: AuthenticatedUser,
    action: string,
    reason: string | undefined,
    op: (tx: Prisma.TransactionClient, b: Safe) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(731091)`;
        const before = await tx.user.findUnique({ where: { id }, select });
        if (!before) throw new NotFoundException({ code: 'USER_NOT_FOUND' });
        const after = await op(tx, before);
        await this.audit(tx, a.id, action, id, before, after, reason);
        return after;
      });
    } catch (e) {
      this.unique(e);
    }
  }
  private async canRemove(tx: Prisma.TransactionClient) {
    if (
      (await tx.user.count({
        where: { role: UserRole.SUPER_ADMIN, isActive: true, deletedAt: null },
      })) <= 1
    )
      throw new ConflictException({ code: 'LAST_SUPER_ADMIN' });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    actor: string,
    action: string,
    target: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    // Audit the authorization-relevant change, not an entire user record.  In
    // particular, profiles can contain contact data and must never turn into an
    // implicit copy of PII in the audit log.
    const safeSnapshot = (value: unknown) => {
      if (!value || typeof value !== 'object') return value;
      const user = value as {
        id?: unknown;
        role?: unknown;
        isActive?: unknown;
        deletedAt?: unknown;
        adminEntitlement?: {
          status?: unknown;
          activeFrom?: unknown;
          activeUntil?: unknown;
          tournamentLimit?: unknown;
        } | null;
      };
      return {
        id: user.id,
        role: user.role,
        isActive: user.isActive,
        deletedAt: user.deletedAt,
        adminEntitlement: user.adminEntitlement
          ? {
              status: user.adminEntitlement.status,
              activeFrom: user.adminEntitlement.activeFrom,
              activeUntil: user.adminEntitlement.activeUntil,
              tournamentLimit: user.adminEntitlement.tournamentLimit,
            }
          : null,
      };
    };
    await tx.auditLog.create({
      data: {
        adminUserId: actor,
        eventType: 'ADMIN_ACTION',
        metadata: {
          action,
          targetUserId: target,
          reason: reason?.trim() || null,
          before: safeSnapshot(before),
          after: safeSnapshot(after),
        } as Prisma.InputJsonValue,
      },
    });
  }
  private phone(v: string) {
    return this.identities.phone(v).length >= 6;
  }
  private unique(e: unknown): never {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const t = String(e.meta?.target ?? '');
      throw new ConflictException({
        code: t.includes('normalized_email')
          ? 'EMAIL_ALREADY_EXISTS'
          : t.includes('normalized_phone')
            ? 'PHONE_ALREADY_EXISTS'
            : 'USERNAME_ALREADY_EXISTS',
      });
    }
    throw e;
  }
}
