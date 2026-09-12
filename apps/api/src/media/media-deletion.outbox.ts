import type { Prisma } from '@prisma/client';

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
