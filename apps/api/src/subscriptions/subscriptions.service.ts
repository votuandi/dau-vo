import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  AdminEntitlementStatus,
  AuditEventType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import type { AuthenticatedUser } from '../auth/admin-auth.types';
import {
  addUtcMonths,
  adminAccessEndedAt,
  calculateAdminAccessState,
} from './admin-access.policy';

export { addUtcMonths } from './admin-access.policy';
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PricingService) private readonly pricing: PricingService,
  ) {}
  async activate(
    actor: AuthenticatedUser,
    input: {
      durationBundle?: number;
      tournamentBundle?: number;
      idempotencyKey: string;
    },
  ) {
    this.assertSubscriptionAllowed(actor.role);
    if (!input.idempotencyKey.trim())
      throw new ConflictException({ code: 'INVALID_IDEMPOTENCY_KEY' });
    const old = await this.prisma.subscriptionOrder.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (old) {
      if (old.userId !== actor.id) throw new ForbiddenException();
      return old;
    }
    const quote = await this.pricing.quote(input);
    const now = new Date();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findUnique({
            where: { id: actor.id },
            select: { role: true },
          });
          this.assertSubscriptionAllowed(user?.role);
          const duplicate = await tx.subscriptionOrder.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (duplicate) {
            if (duplicate.userId !== actor.id) throw new ForbiddenException();
            return duplicate;
          }
          const current = await tx.adminEntitlement.findUnique({
            where: { userId: actor.id },
          });
          const active =
            current?.status === AdminEntitlementStatus.ACTIVE &&
            current.activeUntil > now;
          const starts = active && current ? current.activeUntil : now;
          const until = addUtcMonths(starts, quote.totalDurationMonths);
          const limit =
            (active && current ? current.tournamentLimit : 0) +
            quote.totalTournamentLimit;
          const order = await tx.subscriptionOrder.create({
            data: {
              userId: actor.id,
              pricingPlanVersionId: quote.pricingVersionId,
              idempotencyKey: input.idempotencyKey,
              durationBundle: input.durationBundle ?? 0,
              tournamentBundle: input.tournamentBundle ?? 0,
              durationMonthsGranted: quote.totalDurationMonths,
              tournamentLimitGranted: quote.totalTournamentLimit,
              priceSnapshot: quote as Prisma.InputJsonValue,
              totalAmountVnd: quote.totalPayableVnd,
            },
          });
          await tx.adminEntitlement.upsert({
            where: { userId: actor.id },
            create: {
              userId: actor.id,
              status: AdminEntitlementStatus.ACTIVE,
              activeFrom: now,
              activeUntil: until,
              tournamentLimit: limit,
            },
            update: {
              status: AdminEntitlementStatus.ACTIVE,
              activeFrom: active && current ? current.activeFrom : now,
              activeUntil: until,
              tournamentLimit: limit,
              adminAccessEndedAt: null,
            },
          });
          // Only subscription-lapsed records are recoverable on renewal.
          await tx.tournament.updateMany({
            where: {
              deletionReason: 'ADMIN_SUBSCRIPTION_LAPSED',
              ownerUserId: actor.id,
              softDeletedAt: { not: null },
            },
            data: {
              deletionReason: null,
              purgeAfter: null,
              restoredAt: now,
              softDeletedAt: null,
            },
          });
          const updatedUser = await tx.user.updateMany({
            where: { id: actor.id, role: { not: UserRole.SUPER_ADMIN } },
            data: { role: UserRole.ADMIN },
          });
          if (updatedUser.count !== 1) {
            throw new ForbiddenException({
              code: 'SUPER_ADMIN_SUBSCRIPTION_NOT_ALLOWED',
            });
          }
          await tx.auditLog.create({
            data: {
              adminUserId: actor.id,
              eventType: AuditEventType.ADMIN_ACTION,
              metadata: {
                action: 'SUBSCRIPTION_SIMULATED_SUCCESS',
                orderId: order.id,
              },
            },
          });
          return order;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // A concurrent request can both pass the preflight lookup. The unique
      // index remains the authority; convert its conflict to the same safe,
      // owner-scoped idempotent result rather than exposing a 500 response.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.subscriptionOrder.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (duplicate !== null) {
          if (duplicate.userId !== actor.id) throw new ForbiddenException();
          return duplicate;
        }
      }
      throw error;
    }
  }
  async me(userId: string) {
    const [user, used] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { adminEntitlement: true },
      }),
      this.prisma.tournament.count({
        where: { ownerUserId: userId, softDeletedAt: null },
      }),
    ]);
    const now = new Date();
    const entitlement = user?.adminEntitlement ?? null;
    const endedAt = entitlement ? adminAccessEndedAt(entitlement) : null;
    const readOnlyUntil = endedAt ? addUtcMonths(endedAt, 12) : null;
    const accessState = calculateAdminAccessState(
      user?.role ?? UserRole.USER,
      entitlement,
      now,
    );
    return entitlement === null
      ? null
      : {
          ...entitlement,
          accessState,
          readOnlyUntil,
          usedTournamentQuota: used,
          remainingTournamentQuota: Math.max(
            0,
            entitlement.tournamentLimit - used,
          ),
        };
  }
  orders(userId: string) {
    return this.prisma.subscriptionOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private assertSubscriptionAllowed(role: UserRole | undefined): void {
    if (role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException({
        code: 'SUPER_ADMIN_SUBSCRIPTION_NOT_ALLOWED',
      });
    }
  }
}
