import { Inject, Injectable, Logger } from '@nestjs/common';
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

  async reconcile(limit = 100): Promise<{ deleted: number; failed: number }> {
    const rows = await this.prisma.mediaDeletion.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(limit, 1), 1_000),
    });
    let deleted = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.storage.delete(row.storageKey);
        await this.prisma.mediaDeletion.deleteMany({ where: { id: row.id } });
        deleted += 1;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : 'unknown error';
        await this.prisma.mediaDeletion.updateMany({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            lastError: message,
            lastTriedAt: new Date(),
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
    return { deleted, failed };
  }
}
