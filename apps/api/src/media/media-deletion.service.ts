import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IMAGE_STORAGE, type ImageStorage } from './image-storage';

const LEASE_MS = 5 * 60_000;
const DELETE_TIMEOUT_MS = 4 * 60_000 + 30_000;
const PROTECTED_RECHECK_MS = 15 * 60_000;
const FAILURE_BACKOFF_MIN_MS = 5 * 60_000;
const FAILURE_BACKOFF_MAX_MS = 60 * 60_000;

export function failureBackoffMs(previousAttempts: number): number {
  return Math.min(
    FAILURE_BACKOFF_MIN_MS * 2 ** Math.min(previousAttempts, 20),
    FAILURE_BACKOFF_MAX_MS,
  );
}

/** Processes durable post-commit image cleanup. Safe to invoke repeatedly. */
@Injectable()
export class MediaDeletionService {
  private readonly logger = new Logger(MediaDeletionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}

  /**
   * State machine: eligible -> leased -> deleted, protected/deferred, or
   * provider-failed/backoff. Worker death returns leased rows after LEASE_MS.
   */
  async reconcile(limit = 100): Promise<{
    deleted: number;
    failed: number;
    deferred: number;
    contention: number;
  }> {
    const worker = randomUUID();
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const rows = await this.prisma.mediaDeletion.findMany({
      where: {
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 1_000),
    });
    let deleted = 0;
    let failed = 0;
    let deferred = 0;
    let contention = 0;
    for (const row of rows) {
      const claim = await this.prisma.mediaDeletion.updateMany({
        where: {
          id: row.id,
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { leaseOwner: worker, leaseUntil },
      });
      if (!claim.count) {
        contention += 1;
        continue;
      }
      try {
        // This post-claim check means a fresh reference always wins over deletion.
        if (await this.isProtected(row.storageKey)) {
          deferred += 1;
          await this.prisma.mediaDeletion.updateMany({
            where: { id: row.id, leaseOwner: worker },
            data: {
              nextAttemptAt: new Date(now.getTime() + PROTECTED_RECHECK_MS),
              lastTriedAt: now,
              lastError:
                'protected by a live media reference or PENDING migration',
              leaseOwner: null,
              leaseUntil: null,
            },
          });
          this.logger.warn({
            event: 'media_deletion_deferred',
            storageKey: row.storageKey,
          });
          continue;
        }
        await this.deleteBeforeLeaseExpiry(row.storageKey);
        const cleanup = await this.prisma.mediaDeletion.deleteMany({
          where: { id: row.id, leaseOwner: worker },
        });
        if (cleanup.count) deleted += 1;
        else {
          contention += 1;
          this.logger.warn({
            event: 'media_deletion_cleanup_lease_lost',
            storageKey: row.storageKey,
          });
        }
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : 'unknown error';
        const attempts = row.attempts + 1;
        await this.prisma.mediaDeletion.updateMany({
          where: { id: row.id, leaseOwner: worker },
          data: {
            attempts: { increment: 1 },
            lastError: message,
            lastTriedAt: now,
            nextAttemptAt: new Date(
              now.getTime() + failureBackoffMs(row.attempts),
            ),
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        this.logger.warn({
          event: 'media_deletion_failed',
          storageKey: row.storageKey,
          attempts,
          error: message,
        });
      }
    }
    return { deleted, failed, deferred, contention };
  }

  private async deleteBeforeLeaseExpiry(storageKey: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS);
    timer.unref();
    try {
      await this.storage.delete(storageKey, { abortSignal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async isProtected(storageKey: string): Promise<boolean> {
    const [tournaments, organizations, athletes, snapshots, migrations] =
      await Promise.all([
        this.prisma.tournament.count({ where: { imagePath: storageKey } }),
        this.prisma.tournamentOrganization.count({
          where: { imagePath: storageKey },
        }),
        this.prisma.tournamentAthlete.count({
          where: { imagePath: storageKey },
        }),
        this.prisma.bracketEntrant.count({
          where: { snapshotImagePath: storageKey },
        }),
        this.prisma.mediaMigration.count({
          where: { storageKey, state: 'PENDING' },
        }),
      ]);
    return tournaments + organizations + athletes + snapshots + migrations > 0;
  }
}
