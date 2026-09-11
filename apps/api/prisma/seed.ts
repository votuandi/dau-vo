import { resolve } from 'node:path';
import process from 'node:process';

import { compare, hash } from 'bcryptjs';
import { PrismaClient, PricingDiscountType, UserRole } from '@prisma/client';
import { config as loadEnvironment } from 'dotenv';
import {
  passwordValidationCode,
  passwordValidationMessage,
} from '../src/auth/password-policy';

const BCRYPT_COST = 12;
const DEFAULT_SUPER_ADMIN_PASSWORD = 'dauvo@123';
const INITIAL_SUPER_ADMIN_PASSWORD = 'INITIAL_SUPER_ADMIN_PASSWORD';
export const INITIAL_SUPER_ADMIN_USERNAME = 'superadmin';

const apiDirectory = process.cwd();
loadEnvironment({ path: resolve(apiDirectory, '.env') });
loadEnvironment({ path: resolve(apiDirectory, '../../.env') });

function nodeEnvironment(): string {
  return process.env.NODE_ENV?.trim().toLowerCase() ?? 'development';
}

export function initialSuperAdminPassword(
  environment = nodeEnvironment(),
): string {
  const configured = process.env[INITIAL_SUPER_ADMIN_PASSWORD];

  if (environment === 'production') {
    if (configured === undefined || configured.trim().length === 0) {
      throw new Error(
        `${INITIAL_SUPER_ADMIN_PASSWORD} must be set in production`,
      );
    }
    if (configured === DEFAULT_SUPER_ADMIN_PASSWORD) {
      throw new Error(
        `${INITIAL_SUPER_ADMIN_PASSWORD} must not use the public default in production`,
      );
    }
    return configured;
  }

  return configured && configured.length > 0
    ? configured
    : DEFAULT_SUPER_ADMIN_PASSWORD;
}

export function validateInitialPassword(password: string): void {
  const code = passwordValidationCode(password);
  if (code !== null)
    throw new Error(
      `${INITIAL_SUPER_ADMIN_PASSWORD}: ${code} (${passwordValidationMessage(code)})`,
    );
}

export async function ensureInitialSuperAdmin(
  prisma: Pick<PrismaClient, 'user'>,
  password: string,
): Promise<void> {
  validateInitialPassword(password);
  const existing = await prisma.user.findUnique({
    where: { normalizedUsername: INITIAL_SUPER_ADMIN_USERNAME },
    select: {
      id: true,
      passwordHash: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (existing === null) {
    await prisma.user.create({
      data: {
        isActive: true,
        normalizedUsername: INITIAL_SUPER_ADMIN_USERNAME,
        passwordHash: await hash(password, BCRYPT_COST),
        role: UserRole.SUPER_ADMIN,
        username: INITIAL_SUPER_ADMIN_USERNAME,
      },
    });
    return;
  }

  const passwordMatches = await compare(password, existing.passwordHash);
  if (
    passwordMatches &&
    existing.role === UserRole.SUPER_ADMIN &&
    existing.isActive &&
    existing.deletedAt === null
  ) {
    return;
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      deletedAt: null,
      isActive: true,
      role: UserRole.SUPER_ADMIN,
      ...(passwordMatches
        ? {}
        : { passwordHash: await hash(password, BCRYPT_COST) }),
    },
  });
}

export async function ensureInitialPricing(
  prisma: Pick<PrismaClient, 'pricingPlanVersion'>,
): Promise<void> {
  const active = await prisma.pricingPlanVersion.findFirst({
    where: { active: true },
    select: { id: true },
  });
  if (active) return;
  await prisma.pricingPlanVersion.create({
    data: {
      baseAmountVnd: 200000,
      baseDurationMonths: 1,
      baseTournamentLimit: 3,
      durationAddonUnitAmountVnd: 50000,
      tournamentAddonUnitAmountVnd: 68000,
      active: true,
      activatedAt: new Date(),
      discountTiers: {
        create: [
          {
            type: PricingDiscountType.DURATION,
            quantity: 6,
            discountBasisPoints: 1000,
          },
          {
            type: PricingDiscountType.DURATION,
            quantity: 12,
            discountBasisPoints: 2500,
          },
          {
            type: PricingDiscountType.TOURNAMENT,
            quantity: 3,
            discountBasisPoints: 500,
          },
          {
            type: PricingDiscountType.TOURNAMENT,
            quantity: 5,
            discountBasisPoints: 1000,
          },
          {
            type: PricingDiscountType.TOURNAMENT,
            quantity: 10,
            discountBasisPoints: 2500,
          },
        ],
      },
    },
  });
}

async function seedInitialSuperAdmin(): Promise<void> {
  const password = initialSuperAdminPassword();
  const prisma = new PrismaClient();
  try {
    await ensureInitialSuperAdmin(prisma, password);
    await ensureInitialPricing(prisma);
    process.stdout.write('Initial super admin ensured.\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined) {
  void seedInitialSuperAdmin().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Unknown seed failure';
    process.stderr.write(`Unable to seed initial super admin: ${message}\n`);
    process.exitCode = 1;
  });
}
