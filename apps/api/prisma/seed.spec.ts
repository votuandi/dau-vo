import { compare, hash } from 'bcryptjs';
import { UserRole, type PrismaClient } from '@prisma/client';

import {
  ensureInitialSuperAdmin,
  INITIAL_SUPER_ADMIN_USERNAME,
  initialSuperAdminPassword,
  validateInitialPassword,
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

  it('applies the shared bcrypt byte limit without exposing the password', () => {
    expect(() => validateInitialPassword('a'.repeat(72))).not.toThrow();
    expect(() => validateInitialPassword('😀'.repeat(19))).toThrow(
      'PASSWORD_TOO_LONG',
    );
  });

  function prismaForUser(
    existing: {
      id: string;
      passwordHash: string;
      role: UserRole;
      isActive: boolean;
      deletedAt: Date | null;
    } | null,
  ) {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const prisma = { user: { findUnique, create, update } } as unknown as Pick<
      PrismaClient,
      'user'
    >;
    findUnique.mockResolvedValue(existing);
    return { create, findUnique, prisma, update };
  }

  it('creates the account when it does not exist', async () => {
    const { create, prisma, update } = prismaForUser(null);
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
    expect(update).not.toHaveBeenCalled();
  });

  it('re-runs with a matching password without replacing its hash', async () => {
    const passwordHash = await hash('dauvo@123', 4);
    const { create, prisma, update } = prismaForUser({
      id: 'user-id',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      deletedAt: null,
    });

    await ensureInitialSuperAdmin(prisma, 'dauvo@123');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the hash when the configured password changes', async () => {
    const oldHash = await hash('dauvo@123', 4);
    const { prisma, update } = prismaForUser({
      id: 'user-id',
      passwordHash: oldHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      deletedAt: null,
    });

    await ensureInitialSuperAdmin(prisma, 'changed-password');
    const data = update.mock.calls[0][0].data as { passwordHash: string };
    expect(await compare('changed-password', data.passwordHash)).toBe(true);
    expect(await compare('dauvo@123', data.passwordHash)).toBe(false);
  });

  it('restores an existing soft-deleted account without replacing its ID', async () => {
    const passwordHash = await hash('dauvo@123', 4);
    const deletedAt = new Date('2026-01-01T00:00:00.000Z');
    const { prisma, update } = prismaForUser({
      id: 'preserved-user-id',
      passwordHash,
      role: UserRole.ADMIN,
      isActive: false,
      deletedAt,
    });

    await ensureInitialSuperAdmin(prisma, 'dauvo@123');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'preserved-user-id' },
      data: { deletedAt: null, isActive: true, role: 'SUPER_ADMIN' },
    });
  });

  it('restores an inactive account', async () => {
    const passwordHash = await hash('dauvo@123', 4);
    const { prisma, update } = prismaForUser({
      id: 'inactive-user-id',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: false,
      deletedAt: null,
    });

    await ensureInitialSuperAdmin(prisma, 'dauvo@123');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'inactive-user-id' },
      data: { deletedAt: null, isActive: true, role: 'SUPER_ADMIN' },
    });
  });

  it('produces exactly one normalized superadmin across repeated execution', async () => {
    const first = prismaForUser(null);
    await ensureInitialSuperAdmin(first.prisma, 'dauvo@123');
    const createdHash = first.create.mock.calls[0][0].data
      .passwordHash as string;
    first.findUnique.mockResolvedValue({
      id: 'single-user-id',
      passwordHash: createdHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      deletedAt: null,
    });

    await ensureInitialSuperAdmin(first.prisma, 'dauvo@123');
    await ensureInitialSuperAdmin(first.prisma, 'dauvo@123');
    expect(first.create).toHaveBeenCalledTimes(1);
    expect(first.findUnique).toHaveBeenCalledTimes(3);
    expect(first.findUnique).toHaveBeenCalledWith({
      where: { normalizedUsername: INITIAL_SUPER_ADMIN_USERNAME },
      select: {
        id: true,
        passwordHash: true,
        role: true,
        isActive: true,
        deletedAt: true,
      },
    });
  });
});
