import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AdminEntitlementStatus, AuditEventType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import type { AuthenticatedUser } from '../auth/admin-auth.types';

export function addUtcMonths(value: Date, months: number): Date {
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months + 1, 0));
  return new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), Math.min(value.getUTCDate(), lastDay.getUTCDate()), value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(), value.getUTCMilliseconds()));
}
@Injectable()
export class SubscriptionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(PricingService) private readonly pricing: PricingService) {}
  async activate(actor: AuthenticatedUser, input: { durationBundle?: number; tournamentBundle?: number; idempotencyKey: string }) {
    if (!input.idempotencyKey.trim()) throw new ConflictException({ code: 'INVALID_IDEMPOTENCY_KEY' });
    const old = await this.prisma.subscriptionOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (old) { if (old.userId !== actor.id) throw new ForbiddenException(); return old; }
    const quote = await this.pricing.quote(input); const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.subscriptionOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } }); if (duplicate) return duplicate;
      const current = await tx.adminEntitlement.findUnique({ where: { userId: actor.id } }); const active = current?.status === AdminEntitlementStatus.ACTIVE && current.activeUntil > now;
      const starts = active && current ? current.activeUntil : now; const until = addUtcMonths(starts, quote.totalDurationMonths); const limit = (active && current ? current.tournamentLimit : 0) + quote.totalTournamentLimit;
      const order = await tx.subscriptionOrder.create({ data: { userId: actor.id, pricingPlanVersionId: quote.pricingVersionId, idempotencyKey: input.idempotencyKey, durationBundle: input.durationBundle ?? 0, tournamentBundle: input.tournamentBundle ?? 0, durationMonthsGranted: quote.totalDurationMonths, tournamentLimitGranted: quote.totalTournamentLimit, priceSnapshot: quote as Prisma.InputJsonValue, totalAmountVnd: quote.totalPayableVnd } });
      await tx.adminEntitlement.upsert({ where: { userId: actor.id }, create: { userId: actor.id, status: AdminEntitlementStatus.ACTIVE, activeFrom: now, activeUntil: until, tournamentLimit: limit }, update: { status: AdminEntitlementStatus.ACTIVE, activeFrom: active && current ? current.activeFrom : now, activeUntil: until, tournamentLimit: limit, adminAccessEndedAt: null } });
      await tx.user.update({ where: { id: actor.id }, data: { role: UserRole.ADMIN } }); await tx.auditLog.create({ data: { adminUserId: actor.id, eventType: AuditEventType.ADMIN_ACTION, metadata: { action: 'SUBSCRIPTION_SIMULATED_SUCCESS', orderId: order.id } } }); return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async me(userId: string) { const [entitlement, used] = await Promise.all([this.prisma.adminEntitlement.findUnique({ where: { userId } }), this.prisma.tournament.count({ where: { ownerUserId: userId, softDeletedAt: null } })]); const now = new Date(); const endedAt = entitlement?.adminAccessEndedAt ?? entitlement?.activeUntil; const readOnlyUntil = endedAt ? addUtcMonths(endedAt, 12) : null; const accessState = entitlement?.status === AdminEntitlementStatus.ACTIVE && entitlement.activeFrom <= now && entitlement.activeUntil > now ? 'ACTIVE_ADMIN' : readOnlyUntil !== null && now < readOnlyUntil ? 'EXPIRED_READ_ONLY' : 'HIDDEN'; return entitlement === null ? null : { ...entitlement, accessState, readOnlyUntil, usedTournamentQuota: used, remainingTournamentQuota: Math.max(0, entitlement.tournamentLimit - used) }; }
  orders(userId: string) { return this.prisma.subscriptionOrder.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
}
