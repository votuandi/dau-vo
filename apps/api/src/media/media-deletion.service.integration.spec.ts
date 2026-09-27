import { PrismaClient } from '@prisma/client';
import { MediaDeletionService } from './media-deletion.service';

// This suite deliberately uses Prisma and PostgreSQL rather than mocked
// findMany calls. Point it at a disposable database after `prisma migrate
// deploy`, for example from CI:
// MEDIA_RECONCILIATION_TEST_DATABASE_URL=postgresql://... pnpm test -- media-deletion.service.integration
const databaseUrl = process.env.MEDIA_RECONCILIATION_TEST_DATABASE_URL;
const describeDatabase = databaseUrl === undefined ? describe.skip : describe;

describeDatabase('MediaDeletionService PostgreSQL scheduling', () => {
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl ?? '' } },
  });
  const prefix = `reconcile-test/${Date.now()}-`;
  const protectedKeys = Array.from(
    { length: 100 },
    (_, index) => `${prefix}protected-${index}.webp`,
  );
  const deletedKeys: string[] = [];
  let failOnce = true;
  const storage = {
    delete: jest.fn(async (key: string) => {
      if (key === `${prefix}failure.webp` && failOnce) {
        failOnce = false;
        throw new Error('temporary provider outage');
      }
      deletedKeys.push(key);
    }),
  };
  const service = new MediaDeletionService(prisma as never, storage as never);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.mediaDeletion.deleteMany({
      where: { storageKey: { startsWith: prefix } },
    });
    await prisma.mediaMigration.deleteMany({
      where: { storageKey: { startsWith: prefix } },
    });
  });

  afterAll(async () => {
    await prisma.mediaDeletion.deleteMany({
      where: { storageKey: { startsWith: prefix } },
    });
    await prisma.mediaMigration.deleteMany({
      where: { storageKey: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  });

  it('makes bounded progress, defers protectors, retries failures, and claims atomically', async () => {
    const readyKey = `${prefix}new-ready.webp`;
    await prisma.mediaMigration.createMany({
      data: protectedKeys.map((storageKey) => ({
        storageKey,
        state: 'PENDING',
      })),
    });
    await prisma.mediaDeletion.createMany({
      data: [
        ...protectedKeys.map((storageKey) => ({
          storageKey,
          reason: 'TEST_PROTECTED',
        })),
        { storageKey: readyKey, reason: 'TEST_READY' },
      ],
    });

    // The first bounded page contains only old protected work. It is durably
    // moved out of the ready set, so the newer key is processed next cycle.
    await expect(service.reconcile(100)).resolves.toMatchObject({
      deferred: 100,
      deleted: 0,
    });
    await expect(service.reconcile(100)).resolves.toMatchObject({ deleted: 1 });
    expect(deletedKeys).toContain(readyKey);

    // A removed protector becomes eligible again and is eventually deleted.
    const releasedKey = protectedKeys[0]!;
    await prisma.mediaMigration.delete({ where: { storageKey: releasedKey } });
    await prisma.mediaDeletion.update({
      where: { storageKey: releasedKey },
      data: { nextAttemptAt: new Date(Date.now() - 1) },
    });
    await service.reconcile(100);
    expect(deletedKeys).toContain(releasedKey);

    // Provider errors retain audit fields and move the row out of the ready set.
    const failureKey = `${prefix}failure.webp`;
    await prisma.mediaDeletion.create({
      data: { storageKey: failureKey, reason: 'TEST_FAILURE' },
    });
    await expect(service.reconcile(100)).resolves.toMatchObject({ failed: 1 });
    const failed = await prisma.mediaDeletion.findUniqueOrThrow({
      where: { storageKey: failureKey },
    });
    expect(failed.attempts).toBe(1);
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.mediaDeletion.update({
      where: { storageKey: failureKey },
      data: { nextAttemptAt: new Date(Date.now() - 1) },
    });
    await service.reconcile(100);
    expect(deletedKeys).toContain(failureKey);

    // Two workers may read the same ready row, but compare-and-claim allows
    // exactly one provider delete. Expired leases recover; live ones do not.
    const concurrentKey = `${prefix}concurrent.webp`;
    const expiredKey = `${prefix}expired.webp`;
    const liveLeaseKey = `${prefix}live-lease.webp`;
    await prisma.mediaDeletion.createMany({
      data: [
        { storageKey: concurrentKey, reason: 'TEST_CONCURRENT' },
        {
          storageKey: expiredKey,
          reason: 'TEST_EXPIRED',
          leaseOwner: 'dead-worker',
          leaseUntil: new Date(Date.now() - 1),
        },
        {
          storageKey: liveLeaseKey,
          reason: 'TEST_LIVE_LEASE',
          leaseOwner: 'live-worker',
          leaseUntil: new Date(Date.now() + 60_000),
        },
      ],
    });
    const otherWorker = new MediaDeletionService(
      prisma as never,
      storage as never,
    );
    await Promise.all([service.reconcile(100), otherWorker.reconcile(100)]);
    expect(deletedKeys.filter((key) => key === concurrentKey)).toHaveLength(1);
    expect(deletedKeys).toContain(expiredKey);
    await expect(
      prisma.mediaDeletion.findUniqueOrThrow({
        where: { storageKey: liveLeaseKey },
      }),
    ).resolves.toMatchObject({ leaseOwner: 'live-worker' });
  });
});
