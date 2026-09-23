import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { IMAGE_STORAGE, type ImageStorage } from './image-storage';

/** Processes durable post-commit image cleanup. Safe to invoke repeatedly. */
@Injectable()
export class MediaDeletionService {
  private readonly logger = new Logger(MediaDeletionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
  ) {}

  async reconcile(
    limit = 100,
  ): Promise<{ deleted: number; failed: number; skipped: number }> {
    const worker = randomUUID();
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 5 * 60_000);
    const rows = await this.prisma.mediaDeletion.findMany({
      where: { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 1_000),
    });
    let deleted = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of rows) {
      // Claim each row atomically. Several cron invocations/API replicas may run
      // safely; an abandoned lease becomes eligible again after five minutes.
      const claim = await this.prisma.mediaDeletion.updateMany({
        where: {
          id: row.id,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { leaseOwner: worker, leaseUntil },
      });
      if (!claim.count) continue;
      try {
        if (await this.isProtected(row.storageKey)) {
          skipped += 1;
          await this.prisma.mediaDeletion.updateMany({
            where: { id: row.id, leaseOwner: worker },
            data: { leaseOwner: null, leaseUntil: null },
          });
          this.logger.warn({
            event: 'media_deletion_protected',
            storageKey: row.storageKey,
          });
          continue;
        }
        await this.storage.delete(row.storageKey);
        await this.prisma.mediaDeletion.deleteMany({
          where: { id: row.id, leaseOwner: worker },
        });
        deleted += 1;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : 'unknown error';
        await this.prisma.mediaDeletion.updateMany({
          where: { id: row.id, leaseOwner: worker },
          data: {
            attempts: { increment: 1 },
            lastError: message,
            lastTriedAt: new Date(),
            leaseOwner: null,
            leaseUntil: null,
          },
        });
        this.logger.warn({
          event: 'media_deletion_failed',
          storageKey: row.storageKey,
          attempts: row.attempts + 1,
          error: message,
        });
      }
    }
    return { deleted, failed, skipped };
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
