import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { config as loadEnvironment } from 'dotenv';

const BCRYPT_COST = 12;
const MAX_USERNAME_LENGTH = 100;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

const apiDirectory = process.cwd();

// Prefer process and API-local values, then fill any missing values from the
// monorepo root environment file used by the rest of the application.
loadEnvironment({ path: resolve(apiDirectory, '.env') });
loadEnvironment({ path: resolve(apiDirectory, '../../.env') });

function requireEnvironmentValue(
  name: 'SEED_ADMIN_PASSWORD' | 'SEED_ADMIN_USERNAME',
): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return name === 'SEED_ADMIN_USERNAME' ? value.trim() : value;
}

function validateUsername(username: string): void {
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new Error(
      `SEED_ADMIN_USERNAME must not exceed ${MAX_USERNAME_LENGTH} characters`,
    );
  }

  if (!/^[a-zA-Z0-9._-]+$/u.test(username)) {
    throw new Error(
      'SEED_ADMIN_USERNAME may contain only letters, numbers, periods, underscores, and hyphens',
    );
  }
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must contain at least 8 characters');
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_PASSWORD_BYTES) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must not exceed ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes`,
    );
  }
}

function assertDevelopmentEnvironment(): void {
  const environment =
    process.env.NODE_ENV?.trim().toLowerCase() ?? 'development';

  if (environment === 'production') {
    throw new Error(
      'The development admin seed is disabled when NODE_ENV=production',
    );
  }
}

async function seedDevelopmentAdmin(): Promise<void> {
  assertDevelopmentEnvironment();

  const username = requireEnvironmentValue('SEED_ADMIN_USERNAME');
  const password = requireEnvironmentValue('SEED_ADMIN_PASSWORD');

  validateUsername(username);
  validatePassword(password);

  const passwordHash = await hash(password, BCRYPT_COST);
  const prisma = new PrismaClient();

  try {
    await prisma.adminUser.upsert({
      where: { username },
      update: { passwordHash },
      create: { username, passwordHash },
    });

    process.stdout.write(
      `Development admin seeded for username "${username}".\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void seedDevelopmentAdmin().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unknown seed failure';
  process.stderr.write(`Unable to seed the development admin: ${message}\n`);
  process.exitCode = 1;
});
