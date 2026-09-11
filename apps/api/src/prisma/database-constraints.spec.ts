import { resolve } from 'node:path';

import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  PrismaClient,
  RefereeSlot,
} from '@prisma/client';
import { config as loadEnvironment } from 'dotenv';

loadEnvironment({ path: resolve(process.cwd(), '.env') });
loadEnvironment({ path: resolve(process.cwd(), '../../.env') });

const DEFAULT_DATABASE_URL =
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';

const fixture = {
  accessCodeId: '50000000-0000-4000-8000-000000000001',
  athleteId: '40000000-0000-4000-8000-000000000001',
  duplicateAthleteId: '40000000-0000-4000-8000-000000000002',
  duplicateMatchId: '20000000-0000-4000-8000-000000000002',
  duplicateVoteId: '80000000-0000-4000-8000-000000000002',
  matchId: '20000000-0000-4000-8000-000000000001',
  publicId: 'db-constraint-public-id',
  scoringWindowId: '70000000-0000-4000-8000-000000000001',
  sessionId: '60000000-0000-4000-8000-000000000001',
  tournamentId: '10000000-0000-4000-8000-000000000001',
  voteId: '80000000-0000-4000-8000-000000000001',
} as const;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    },
  },
});

async function cleanFixtures(): Promise<void> {
  const matchIds = [fixture.matchId, fixture.duplicateMatchId];

  await prisma.refereeVote.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.scoringWindow.deleteMany({
    where: { matchId: { in: matchIds } },
  });
  await prisma.matchSession.deleteMany({
    where: { matchId: { in: matchIds } },
  });
  await prisma.matchAccessCode.deleteMany({
    where: { matchId: { in: matchIds } },
  });
  await prisma.matchAthlete.deleteMany({
    where: { matchId: { in: matchIds } },
  });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.tournament.deleteMany({ where: { id: fixture.tournamentId } });
}

async function createMatchFixture(): Promise<void> {
  await prisma.tournament.create({
    data: {
      id: fixture.tournamentId,
      name: 'Database constraint test tournament',
    },
  });

  await prisma.match.create({
    data: {
      breakDurationMs: 60_000,
      id: fixture.matchId,
      publicId: fixture.publicId,
      roundDurationMs: 120_000,
      tournamentId: fixture.tournamentId,
    },
  });
}

describe('database unique constraints', () => {
  jest.setTimeout(30_000);

  beforeAll(async () => {
    await prisma.$connect();
    await cleanFixtures();
  });

  beforeEach(async () => {
    await cleanFixtures();
    await createMatchFixture();
  });

  afterEach(async () => {
    await cleanFixtures();
  });

  afterAll(async () => {
    await cleanFixtures();
    await prisma.$disconnect();
  });

  it('rejects duplicate Match.publicId values', async () => {
    await expect(
      prisma.match.create({
        data: {
          breakDurationMs: 60_000,
          id: fixture.duplicateMatchId,
          publicId: fixture.publicId,
          roundDurationMs: 120_000,
          tournamentId: fixture.tournamentId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects duplicate MatchAthlete colors within a match', async () => {
    await prisma.matchAthlete.create({
      data: {
        color: AthleteColor.RED,
        id: fixture.athleteId,
        matchId: fixture.matchId,
        name: 'Red athlete one',
        organization: 'Constraint test club',
      },
    });

    await expect(
      prisma.matchAthlete.create({
        data: {
          color: AthleteColor.RED,
          id: fixture.duplicateAthleteId,
          matchId: fixture.matchId,
          name: 'Red athlete two',
          organization: 'Another constraint test club',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects duplicate referee slots within a scoring window', async () => {
    await prisma.matchAccessCode.create({
      data: {
        codeHash: 'database-constraint-test-code-hash',
        id: fixture.accessCodeId,
        matchId: fixture.matchId,
        role: MatchAccessRole.REFEREE_1,
      },
    });
    await prisma.matchSession.create({
      data: {
        accessCodeId: fixture.accessCodeId,
        deviceId: 'database-constraint-test-device',
        id: fixture.sessionId,
        matchId: fixture.matchId,
        refereeSlot: RefereeSlot.REFEREE_1,
        role: MatchRole.REFEREE,
        tokenHash: 'database-constraint-test-token-hash',
      },
    });
    await prisma.scoringWindow.create({
      data: {
        endsAt: new Date('2026-01-01T00:00:05.000Z'),
        id: fixture.scoringWindowId,
        matchId: fixture.matchId,
        roundNumber: 1,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.refereeVote.create({
      data: {
        athleteColor: AthleteColor.RED,
        id: fixture.voteId,
        matchId: fixture.matchId,
        refereeSlot: RefereeSlot.REFEREE_1,
        scoringWindowId: fixture.scoringWindowId,
        sessionId: fixture.sessionId,
      },
    });

    await expect(
      prisma.refereeVote.create({
        data: {
          athleteColor: AthleteColor.BLUE,
          id: fixture.duplicateVoteId,
          matchId: fixture.matchId,
          refereeSlot: RefereeSlot.REFEREE_1,
          scoringWindowId: fixture.scoringWindowId,
          sessionId: fixture.sessionId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
