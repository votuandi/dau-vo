import { PrismaClient, UserRole } from '@prisma/client';

import { INITIAL_SUPER_ADMIN_USERNAME } from './seed';

export async function verifyInitialSuperAdmin(
  prisma: Pick<PrismaClient, 'user'>,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { normalizedUsername: INITIAL_SUPER_ADMIN_USERNAME },
    select: { role: true, isActive: true, deletedAt: true },
  });

  if (
    user === null ||
    user.role !== UserRole.SUPER_ADMIN ||
    !user.isActive ||
    user.deletedAt !== null
  ) {
    throw new Error(
      'Initial super-admin verification failed: normalized superadmin must be active, non-deleted, and have SUPER_ADMIN role',
    );
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await verifyInitialSuperAdmin(prisma);
    process.stdout.write('Initial super-admin verification passed.\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unknown verification failure';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
