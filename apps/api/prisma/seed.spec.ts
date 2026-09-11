import type { PrismaClient } from '@prisma/client';

import {
  ensureInitialSuperAdmin,
  INITIAL_SUPER_ADMIN_USERNAME,
  initialSuperAdminPassword,
} from './seed';

describe('initial super-admin seed', () => {
  const originalPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD;

  afterEach(() => {
    if (originalPassword === undefined)
      delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;
    else process.env.INITIAL_SUPER_ADMIN_PASSWORD = originalPassword;
  });

  it('uses the requested non-production default and rejects unsafe production configuration', () => {
    delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;
    expect(initialSuperAdminPassword('test')).toBe('dauvo@123');
    expect(() => initialSuperAdminPassword('production')).toThrow(
      'must be set in production',
    );
    process.env.INITIAL_SUPER_ADMIN_PASSWORD = 'dauvo@123';
    expect(() => initialSuperAdminPassword('production')).toThrow(
      'must not use the public default',
    );
  });

  it('creates one normalized super admin and retains a matching hash on repeat', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const prisma = { user: { findUnique, create, update } } as unknown as Pick<
      PrismaClient,
      'user'
    >;

    await ensureInitialSuperAdmin(prisma, 'dauvo@123');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          normalizedUsername: INITIAL_SUPER_ADMIN_USERNAME,
          role: 'SUPER_ADMIN',
          isActive: true,
        }),
      }),
    );

    findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: create.mock.calls[0][0].data.passwordHash,
    });
    await ensureInitialSuperAdmin(prisma, 'dauvo@123');
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { isActive: true, role: 'SUPER_ADMIN' },
      }),
    );
  });
});
