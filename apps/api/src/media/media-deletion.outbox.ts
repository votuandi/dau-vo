import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Must be called with the aggregate update transaction. */
export async function enqueueMediaDeletion(
  tx: Prisma.TransactionClient,
  storageKey: string | null,
  reason = 'IMAGE_REPLACED_OR_REMOVED',
): Promise<void> {
  if (storageKey === null) return;
  await tx.mediaDeletion.upsert({
    where: { storageKey },
    create: { storageKey, reason },
    update: {},
  });
}

/**
 * Records a failed post-save compensation outside the failed aggregate
 * transaction. The object was never made reachable, so the normal reconciler
 * can safely retry its removal.
 */
export async function enqueueFailedMediaCompensation(
  prisma: PrismaService,
  storageKey: string,
): Promise<void> {
  await prisma.mediaDeletion.upsert({
    where: { storageKey },
    create: { storageKey, reason: 'SAVE_COMPENSATION_FAILED' },
    update: {},
  });
}
