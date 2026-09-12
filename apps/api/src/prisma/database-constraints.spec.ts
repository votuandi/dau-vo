import { resolve } from 'node:path';

import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  PrismaClient,
  RefereeSlot,
} from '@prisma/client';
import { config as loadEnvironment } from 'dotenv';

import { DEFAULT_SPORT, DEFAULT_SPORT_GROUP } from '../../prisma/default-sport';

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
  otherTournamentId: '10000000-0000-4000-8000-000000000003',
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
  await prisma.tournamentAthlete.deleteMany({
    where: {
      tournamentId: { in: [fixture.tournamentId, fixture.otherTournamentId] },
    },
  });
  await prisma.tournamentUnit.deleteMany({
    where: {
      tournamentId: { in: [fixture.tournamentId, fixture.otherTournamentId] },
    },
  });
  await prisma.tournamentWeightClass.deleteMany({
    where: {
      tournamentId: { in: [fixture.tournamentId, fixture.otherTournamentId] },
    },
  });
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  await prisma.tournament.deleteMany({ where: { id: fixture.tournamentId } });
  await prisma.tournament.deleteMany({
    where: { id: fixture.otherTournamentId },
  });
  await prisma.user.deleteMany({ where: { id: fixture.tournamentId } });
  await prisma.user.deleteMany({ where: { id: fixture.otherTournamentId } });
}

async function createMatchFixture(): Promise<void> {
  await prisma.user.create({
    data: {
      id: fixture.tournamentId,
      normalizedUsername: 'database-constraint-owner',
      passwordHash: 'database-constraint-test-password-hash',
      username: 'database-constraint-owner',
    },
  });
  await prisma.tournament.create({
    data: {
      id: fixture.tournamentId,
      name: 'Database constraint test tournament',
      ownerUserId: fixture.tournamentId,
      sportId: DEFAULT_SPORT.id,
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

  it('rejects deleting a Sport referenced by a Tournament', async () => {
    await expect(
      prisma.sport.delete({ where: { id: DEFAULT_SPORT.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects deleting a Sport Group referenced by a Sport', async () => {
    await expect(
      prisma.sportGroup.delete({ where: { id: DEFAULT_SPORT_GROUP.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces Sport and Sport Group catalog uniqueness', async () => {
    await expect(
      prisma.sportGroup.create({
        data: {
          code: DEFAULT_SPORT_GROUP.code,
          name: 'Duplicate catalog group',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.sport.create({
        data: {
          code: DEFAULT_SPORT.code,
          name: 'Duplicate code sport',
          normalizedName: 'duplicate code sport',
          sportGroupId: DEFAULT_SPORT_GROUP.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.sport.create({
        data: {
          code: 'UNIQUE_CODE_BUT_DUPLICATE_NORMALIZED_NAME',
          name: 'Duplicate normalized name sport',
          normalizedName: DEFAULT_SPORT.normalizedName,
          sportGroupId: DEFAULT_SPORT_GROUP.id,
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

  it('enforces tournament-scoped roster references and permits an unassigned athlete', async () => {
    await prisma.user.create({
      data: {
        id: fixture.otherTournamentId,
        username: 'other-roster-owner',
        normalizedUsername: 'other-roster-owner',
        passwordHash: 'hash',
      },
    });
    await prisma.tournament.create({
      data: {
        id: fixture.otherTournamentId,
        name: 'Other roster tournament',
        ownerUserId: fixture.otherTournamentId,
        sportId: DEFAULT_SPORT.id,
      },
    });
    const ownWeightClass = await prisma.tournamentWeightClass.create({
      data: {
        tournamentId: fixture.tournamentId,
        name: 'Light',
        normalizedName: 'light',
      },
    });
    const otherWeightClass = await prisma.tournamentWeightClass.create({
      data: {
        tournamentId: fixture.otherTournamentId,
        name: 'Heavy',
        normalizedName: 'heavy',
      },
    });
    const otherUnit = await prisma.tournamentUnit.create({
      data: {
        tournamentId: fixture.otherTournamentId,
        name: 'Other unit',
        normalizedName: 'other unit',
      },
    });
    const otherAthlete = await prisma.tournamentAthlete.create({
      data: {
        tournamentId: fixture.otherTournamentId,
        weightClassId: otherWeightClass.id,
        name: 'Other athlete',
        birthYear: 2000,
      },
    });

    await expect(
      prisma.tournamentAthlete.create({
        data: {
          tournamentId: fixture.tournamentId,
          unitId: otherUnit.id,
          weightClassId: ownWeightClass.id,
          name: 'Invalid unit',
          birthYear: 2000,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.tournamentAthlete.create({
        data: {
          tournamentId: fixture.tournamentId,
          weightClassId: otherWeightClass.id,
          name: 'Invalid weight',
          birthYear: 2000,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const athlete = await prisma.tournamentAthlete.create({
      data: {
        tournamentId: fixture.tournamentId,
        weightClassId: ownWeightClass.id,
        name: 'No unit',
        birthYear: 2000,
      },
    });
    await expect(
      prisma.match.update({
        where: { id: fixture.matchId },
        data: { weightClassId: otherWeightClass.id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.matchAthlete.create({
        data: {
          id: fixture.athleteId,
          matchId: fixture.matchId,
          tournamentId: fixture.tournamentId,
          athleteId: otherAthlete.id,
          color: AthleteColor.RED,
          name: 'Snapshot',
          organization: 'Club',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await prisma.matchAthlete.create({
      data: {
        id: fixture.athleteId,
        matchId: fixture.matchId,
        tournamentId: fixture.tournamentId,
        athleteId: athlete.id,
        color: AthleteColor.RED,
        name: 'Snapshot',
        organization: 'Club',
      },
    });
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
