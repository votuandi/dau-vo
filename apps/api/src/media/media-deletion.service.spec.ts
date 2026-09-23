import { MediaDeletionService } from './media-deletion.service';

describe('MediaDeletionService', () => {
  const key = 'athletes/123e4567-e89b-12d3-a456-426614174000.webp';

  function subject(overrides: Record<string, unknown> = {}) {
    const prisma = {
      mediaDeletion: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'row', storageKey: key, attempts: 0 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tournament: { count: jest.fn().mockResolvedValue(0) },
      tournamentOrganization: { count: jest.fn().mockResolvedValue(0) },
      tournamentAthlete: { count: jest.fn().mockResolvedValue(0) },
      bracketEntrant: { count: jest.fn().mockResolvedValue(0) },
      mediaMigration: { count: jest.fn().mockResolvedValue(0) },
      ...overrides,
    };
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };
    return {
      service: new MediaDeletionService(prisma as never, storage as never),
      prisma,
      storage,
    };
  }

  it('removes a row after an idempotent successful delete (including an absent object)', async () => {
    const { service, prisma, storage } = subject();
    await expect(service.reconcile()).resolves.toEqual({
      deleted: 1,
      failed: 0,
      skipped: 0,
    });
    expect(storage.delete).toHaveBeenCalledWith(key);
    expect(prisma.mediaDeletion.deleteMany).toHaveBeenCalled();
  });

  it('retains a transient storage failure for retry', async () => {
    const { service, prisma, storage } = subject();
    storage.delete.mockRejectedValueOnce(new Error('temporary S3 outage'));
    await expect(service.reconcile()).resolves.toEqual({
      deleted: 0,
      failed: 1,
      skipped: 0,
    });
    expect(prisma.mediaDeletion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.mediaDeletion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
  });

  it('never deletes a key that remains referenced or is pending migration', async () => {
    const { service, storage, prisma } = subject({
      tournament: { count: jest.fn().mockResolvedValue(1) },
    });
    await expect(service.reconcile()).resolves.toEqual({
      deleted: 0,
      failed: 0,
      skipped: 1,
    });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.mediaDeletion.deleteMany).not.toHaveBeenCalled();
  });
});
