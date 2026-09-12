import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AdminEntitlementStatus,
  AuditEventType,
  Prisma,
  TournamentDeletionReason,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MediaDeletionService } from '../media/media-deletion.service';
import { addUtcMonths, ADMIN_GRACE_MONTHS } from './admin-access.policy';

const RECOVERY_DAYS = 60;

/** Idempotent lifecycle processor. Request-time authorization remains authoritative. */
@Injectable()
export class TournamentLifecycleService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TournamentLifecycleService.name);
  private timer: NodeJS.Timeout | undefined;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MediaDeletionService)
    private readonly mediaDeletion: MediaDeletionService,
  ) {}

  onModuleInit(): void {
    // Each instance may tick; the transaction advisory lock elects one processor.
    this.timer = setInterval(
      () =>
        void this.run().catch((error: unknown) =>
          this.logger.error({ event: 'tournament_lifecycle_failed', error }),
        ),
      60 * 60 * 1000,
    );
    this.timer.unref();
    void this.run().catch((error: unknown) =>
      this.logger.error({ event: 'tournament_lifecycle_failed', error }),
    );
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<{
    expired: number;
    softDeleted: number;
    restored: number;
    purged: number;
    media: { deleted: number; failed: number };
  }> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const lock = await tx.$queryRaw<
          Array<{ locked: boolean }>
        >`SELECT pg_try_advisory_xact_lock(73421891) AS locked`;
        if (!lock[0]?.locked)
          return {
            expired: 0,
            softDeleted: 0,
            restored: 0,
            purged: 0,
          };
        const expired = await tx.adminEntitlement.updateMany({
          where: {
            status: AdminEntitlementStatus.ACTIVE,
            activeUntil: { lte: now },
          },
          data: { status: AdminEntitlementStatus.EXPIRED },
        });
        await tx.$executeRaw`UPDATE admin_entitlements SET admin_access_ended_at = active_until WHERE status = 'EXPIRED' AND admin_access_ended_at IS NULL`;
        // Never touch SUPER_ADMIN; only stale persisted ADMIN roles are downgraded.
        await tx.user.updateMany({
          where: {
            role: 'ADMIN',
            adminEntitlement: { status: AdminEntitlementStatus.EXPIRED },
          },
          data: { role: 'USER' },
        });
        const restored = await tx.tournament.updateMany({
          where: {
            deletionReason: TournamentDeletionReason.ADMIN_SUBSCRIPTION_LAPSED,
            softDeletedAt: { not: null },
            owner: {
              adminEntitlement: {
                status: AdminEntitlementStatus.ACTIVE,
                activeFrom: { lte: now },
                activeUntil: { gt: now },
              },
            },
          },
          data: {
            softDeletedAt: null,
            purgeAfter: null,
            deletionReason: null,
            restoredAt: now,
          },
        });
        const owners = await tx.adminEntitlement.findMany({
          where: {
            status: {
              in: [AdminEntitlementStatus.EXPIRED],
            },
            adminAccessEndedAt: { not: null },
          },
          select: { userId: true, adminAccessEndedAt: true },
        });
        let softDeleted = 0;
        for (const owner of owners) {
          if (
            owner.adminAccessEndedAt === null ||
            addUtcMonths(owner.adminAccessEndedAt, ADMIN_GRACE_MONTHS) > now
          )
            continue;
          const changed = await tx.tournament.updateMany({
            where: { ownerUserId: owner.userId, softDeletedAt: null },
            data: {
              softDeletedAt: now,
              purgeAfter: new Date(now.getTime() + RECOVERY_DAYS * 86_400_000),
              deletionReason:
                TournamentDeletionReason.ADMIN_SUBSCRIPTION_LAPSED,
            },
          });
          softDeleted += changed.count;
        }
        const candidates = await tx.tournament.findMany({
          where: { softDeletedAt: { not: null }, purgeAfter: { lte: now } },
          select: { id: true },
        });
        let purged = 0;
        for (const { id } of candidates) {
          // Capture every image before cascade deletion. Storage I/O deliberately
          // happens only after this transaction commits.
          const images = await Promise.all([
            tx.tournament.findUnique({
              where: { id },
              select: { imagePath: true },
            }),
            tx.tournamentUnit.findMany({
              where: { tournamentId: id },
              select: { imagePath: true },
            }),
            tx.tournamentAthlete.findMany({
              where: { tournamentId: id },
              select: { imagePath: true },
            }),
          ]);
          await tx.match.deleteMany({ where: { tournamentId: id } });
          const deleted = await tx.tournament.deleteMany({
            where: {
              id,
              softDeletedAt: { not: null },
              purgeAfter: { lte: now },
            },
          });
          purged += deleted.count;
          if (deleted.count) {
            const keys = [
              images[0]?.imagePath,
              ...images[1].map((row) => row.imagePath),
              ...images[2].map((row) => row.imagePath),
            ].filter((key): key is string => key !== null && key !== undefined);
            if (keys.length)
              await tx.mediaDeletion.createMany({
                data: keys.map((storageKey) => ({
                  storageKey,
                  reason: 'TOURNAMENT_PURGE',
                })),
                skipDuplicates: true,
              });
          }
        }
        if (expired.count + restored.count + softDeleted + purged) {
          await tx.auditLog.create({
            data: {
              eventType: AuditEventType.SYSTEM_EVENT,
              metadata: {
                action: 'TOURNAMENT_LIFECYCLE',
                expired: expired.count,
                restored: restored.count,
                softDeleted,
                purged,
              },
            },
          });
          this.logger.log({
            event: 'tournament_lifecycle_completed',
            expired: expired.count,
            restored: restored.count,
            softDeleted,
            purged,
          });
        }
        return {
          expired: expired.count,
          softDeleted,
          restored: restored.count,
          purged,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    // A failure here is retained in the durable outbox and must never undo the
    // committed aggregate deletion.
    const media = await this.mediaDeletion.reconcile();
    return { ...result, media };
  }
}
