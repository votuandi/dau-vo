import {
  AthleteColor,
  MatchRole,
  MatchStatus,
  PrismaClient,
  RoundStatus,
  TournamentStatus,
} from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';

const prisma = new PrismaClient();

const ids = {
  admin: '00000000-0000-4000-8000-000000000001',
  tournament: '00000000-0000-4000-8000-000000000002',
  match: '00000000-0000-4000-8000-000000000003',
  redAthlete: '00000000-0000-4000-8000-000000000004',
  blueAthlete: '00000000-0000-4000-8000-000000000005',
  roundOne: '00000000-0000-4000-8000-000000000006',
  roundTwo: '00000000-0000-4000-8000-000000000007',
  refereeOneCredential: '00000000-0000-4000-8000-000000000008',
  refereeTwoCredential: '00000000-0000-4000-8000-000000000009',
  refereeThreeCredential: '00000000-0000-4000-8000-000000000010',
  inspectorCredential: '00000000-0000-4000-8000-000000000011',
} as const;

const argonOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

interface CredentialSeed {
  id: string;
  role: MatchRole;
  environmentName: string;
  developmentDefault: string;
}

const credentialSeeds: readonly CredentialSeed[] = [
  {
    id: ids.refereeOneCredential,
    role: MatchRole.REFEREE_1,
    environmentName: 'DEV_REFEREE_1_CODE',
    developmentDefault: '374952',
  },
  {
    id: ids.refereeTwoCredential,
    role: MatchRole.REFEREE_2,
    environmentName: 'DEV_REFEREE_2_CODE',
    developmentDefault: '610284',
  },
  {
    id: ids.refereeThreeCredential,
    role: MatchRole.REFEREE_3,
    environmentName: 'DEV_REFEREE_3_CODE',
    developmentDefault: '915743',
  },
  {
    id: ids.inspectorCredential,
    role: MatchRole.INSPECTOR,
    environmentName: 'DEV_INSPECTOR_CODE',
    developmentDefault: '538194',
  },
];

function environmentValue(name: string, developmentDefault: string): string {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be explicitly set when seeding in production`);
  }
  return developmentDefault;
}

function positiveIntegerEnvironment(name: string, developmentDefault: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return developmentDefault;
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

function nonnegativeIntegerEnvironment(name: string, developmentDefault: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return developmentDefault;
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return parsed;
}

async function hashMatches(encodedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(encodedHash, plaintext, { type: argon2id });
  } catch {
    return false;
  }
}

async function convergentHash(existingHash: string | undefined, plaintext: string): Promise<string> {
  if (existingHash && (await hashMatches(existingHash, plaintext))) {
    return existingHash;
  }
  return hash(plaintext, argonOptions);
}

async function seed(): Promise<void> {
  const username = environmentValue('DEV_ADMIN_USERNAME', 'admin').toLowerCase();
  const password = environmentValue('DEV_ADMIN_PASSWORD', 'change-me-for-local-development');
  const tournamentName = environmentValue(
    'DEV_TOURNAMENT_NAME',
    'National Martial Arts Championship',
  );
  const publicMatchId = environmentValue('DEV_MATCH_PUBLIC_ID', 'A72K9P').toUpperCase();
  const roundDurationMs = positiveIntegerEnvironment('ROUND_DURATION_MS', 120_000);
  const breakDurationMs = nonnegativeIntegerEnvironment('BREAK_DURATION_MS', 60_000);

  if (!/^[a-z0-9._-]{3,100}$/.test(username)) {
    throw new Error('DEV_ADMIN_USERNAME must be a normalized 3-100 character username');
  }
  if (password.length < 12) {
    throw new Error('DEV_ADMIN_PASSWORD must contain at least 12 characters');
  }
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,32}$/.test(publicMatchId)) {
    throw new Error('DEV_MATCH_PUBLIC_ID must use the human-friendly public ID alphabet');
  }

  const codesByRole = new Map<MatchRole, string>();
  for (const credential of credentialSeeds) {
    const code = environmentValue(credential.environmentName, credential.developmentDefault);
    if (!/^\d{6}$/.test(code)) {
      throw new Error(`${credential.environmentName} must contain exactly six digits`);
    }
    codesByRole.set(credential.role, code);
  }

  const [existingAdmin, existingCredentials] = await Promise.all([
    prisma.adminUser.findUnique({ where: { username }, select: { passwordHash: true } }),
    prisma.matchAccessCredential.findMany({
      where: { matchId: ids.match },
      select: { id: true, role: true, codeHash: true },
    }),
  ]);
  const existingCredentialByRole = new Map(
    existingCredentials.map((credential) => [credential.role, credential]),
  );

  const adminPasswordHash = await convergentHash(existingAdmin?.passwordHash, password);
  const preparedCredentials = await Promise.all(
    credentialSeeds.map(async (credential) => {
      const plaintext = codesByRole.get(credential.role);
      if (!plaintext) {
        throw new Error(`Missing development code for ${credential.role}`);
      }
      const existing = existingCredentialByRole.get(credential.role);
      const codeHash = await convergentHash(existing?.codeHash, plaintext);
      return {
        ...credential,
        codeHash,
        hashChanged: Boolean(existing && existing.codeHash !== codeHash),
        exists: Boolean(existing),
      };
    }),
  );

  await prisma.$transaction(
    async (transaction) => {
      await transaction.adminUser.upsert({
        where: { username },
        create: {
          id: ids.admin,
          username,
          passwordHash: adminPasswordHash,
          isActive: true,
        },
        update: {
          passwordHash: adminPasswordHash,
          isActive: true,
        },
      });

      await transaction.tournament.upsert({
        where: { id: ids.tournament },
        create: {
          id: ids.tournament,
          name: tournamentName,
          description: 'Development tournament created by the idempotent Prisma seed.',
          status: TournamentStatus.DRAFT,
        },
        update: { name: tournamentName },
      });

      await transaction.match.upsert({
        where: { id: ids.match },
        create: {
          id: ids.match,
          publicId: publicMatchId,
          tournamentId: ids.tournament,
          status: MatchStatus.WAITING,
          roundDurationMs,
          breakDurationMs,
        },
        update: { publicId: publicMatchId },
      });

      await transaction.matchAthlete.upsert({
        where: { matchId_color: { matchId: ids.match, color: AthleteColor.RED } },
        create: {
          id: ids.redAthlete,
          matchId: ids.match,
          color: AthleteColor.RED,
          name: 'Le Van A',
          organization: "People's Security University",
        },
        update: {
          name: 'Le Van A',
          organization: "People's Security University",
        },
      });

      await transaction.matchAthlete.upsert({
        where: { matchId_color: { matchId: ids.match, color: AthleteColor.BLUE } },
        create: {
          id: ids.blueAthlete,
          matchId: ids.match,
          color: AthleteColor.BLUE,
          name: 'Nguyen Van B',
          organization: 'Saigon Martial Arts Club',
        },
        update: {
          name: 'Nguyen Van B',
          organization: 'Saigon Martial Arts Club',
        },
      });

      for (const credential of preparedCredentials) {
        if (!credential.exists) {
          await transaction.matchAccessCredential.create({
            data: {
              id: credential.id,
              matchId: ids.match,
              role: credential.role,
              codeHash: credential.codeHash,
            },
          });
          continue;
        }
        if (!credential.hashChanged) {
          continue;
        }
        const revokedAt = new Date();
        await transaction.matchSession.updateMany({
          where: { matchId: ids.match, credential: { role: credential.role }, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            revocationReason: 'CODE_REGENERATED',
            revokedAt,
          },
        });
        await transaction.matchAccessCredential.update({
          where: { matchId_role: { matchId: ids.match, role: credential.role } },
          data: {
            codeHash: credential.codeHash,
            codeVersion: { increment: 1 },
            ownershipVersion: { increment: 1 },
            rotatedAt: revokedAt,
          },
        });
      }

      await transaction.matchRound.upsert({
        where: { matchId_number: { matchId: ids.match, number: 1 } },
        create: {
          id: ids.roundOne,
          matchId: ids.match,
          number: 1,
          status: RoundStatus.PENDING,
          scheduledDurationMs: roundDurationMs,
        },
        update: {},
      });
      await transaction.matchRound.upsert({
        where: { matchId_number: { matchId: ids.match, number: 2 } },
        create: {
          id: ids.roundTwo,
          matchId: ids.match,
          number: 2,
          status: RoundStatus.PENDING,
          scheduledDurationMs: roundDurationMs,
        },
        update: {},
      });
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  console.info(
    `Development seed is ready: admin=${username}, tournament=${ids.tournament}, match=${publicMatchId}. Raw passwords and access codes were not logged.`,
  );
}

void seed()
  .catch((error: unknown) => {
    console.error('Development seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
