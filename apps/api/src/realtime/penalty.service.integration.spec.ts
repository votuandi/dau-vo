import { Test } from '@nestjs/testing';
import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  MatchStatus,
  ScoreEventType,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  InactivePenaltySessionError,
  MatchNotRunningForPenaltyError,
  RoundEndedForPenaltyError,
} from './penalty.errors';
import { PenaltyService } from './penalty.service';
import { RealtimeMatchStateService } from './realtime-match-state.service';

const TEST_PREFIX = `penalty-${process.pid}-${Date.now().toString(36)}`;

interface Fixture {
  athleteIds: Record<AthleteColor, string>;
  inspectorSessionId: string;
  matchId: string;
  refereeSessionId: string;
  tournamentId: string;
}

describe('PenaltyService (PostgreSQL integration)', () => {
  jest.setTimeout(60_000);

  let penaltyService: PenaltyService;
  let prisma: PrismaService;
  let matchState: RealtimeMatchStateService;
  const tournamentIds = new Set<string>();

  async function fixture(options?: {
    roundEndsAt?: Date;
    status?: MatchStatus;
  }): Promise<Fixture> {
    const now = new Date();
    const tournament = await prisma.tournament.create({
      data: {
        name: `${TEST_PREFIX}-${randomBytes(5).toString('hex')}`,
        ownerUserId: '00000000-0000-4000-8000-000000000001',
      },
      select: { id: true },
    });
    tournamentIds.add(tournament.id);
    const status = options?.status ?? MatchStatus.ROUND_1_RUNNING;
    const match = await prisma.match.create({
      data: {
        athletes: {
          create: [
            { color: AthleteColor.RED, name: 'Red', organization: 'Test' },
            { color: AthleteColor.BLUE, name: 'Blue', organization: 'Test' },
          ],
        },
        breakDurationMs: 60_000,
        currentRound: status === MatchStatus.ROUND_1_RUNNING ? 1 : null,
        publicId: randomBytes(8).toString('hex').toUpperCase(),
        roundDurationMs: 20_000,
        rounds:
          status === MatchStatus.ROUND_1_RUNNING
            ? {
                create: {
                  endsAt:
                    options?.roundEndsAt ?? new Date(now.getTime() + 20_000),
                  roundNumber: 1,
                  startedAt: new Date(now.getTime() - 500),
                },
              }
            : undefined,
        status,
        tournamentId: tournament.id,
      },
      include: { athletes: true },
    });
    const athleteIds = Object.fromEntries(
      match.athletes.map((athlete) => [athlete.color, athlete.id]),
    ) as Record<AthleteColor, string>;
    const inspectorCode = await prisma.matchAccessCode.create({
      data: {
        codeHash: `${TEST_PREFIX}-inspector`,
        matchId: match.id,
        role: MatchAccessRole.INSPECTOR,
      },
      select: { id: true },
    });
    const refereeCode = await prisma.matchAccessCode.create({
      data: {
        codeHash: `${TEST_PREFIX}-referee`,
        matchId: match.id,
        role: MatchAccessRole.REFEREE_1,
      },
      select: { id: true },
    });
    const [inspectorSession, refereeSession] = await Promise.all([
      prisma.matchSession.create({
        data: {
          accessCodeId: inspectorCode.id,
          active: true,
          deviceId: `${TEST_PREFIX}-inspector-device`,
          expiresAt: new Date(now.getTime() + 60_000),
          matchId: match.id,
          role: MatchRole.INSPECTOR,
          tokenHash: randomBytes(18).toString('hex'),
        },
        select: { id: true },
      }),
      prisma.matchSession.create({
        data: {
          accessCodeId: refereeCode.id,
          active: true,
          deviceId: `${TEST_PREFIX}-referee-device`,
          expiresAt: new Date(now.getTime() + 60_000),
          matchId: match.id,
          refereeSlot: 'REFEREE_1',
          role: MatchRole.REFEREE,
          tokenHash: randomBytes(18).toString('hex'),
        },
        select: { id: true },
      }),
    ]);
    return {
      athleteIds,
      inspectorSessionId: inspectorSession.id,
      matchId: match.id,
      refereeSessionId: refereeSession.id,
      tournamentId: tournament.id,
    };
  }

  async function add(current: Fixture, athlete: AthleteColor) {
    return penaltyService.addPenalty({
      athlete,
      matchId: current.matchId,
      sessionId: current.inspectorSessionId,
    });
  }

  beforeAll(async () => {
    Object.assign(process.env, {
      ADMIN_SESSION_SECRET:
        'penalty-admin-session-secret-with-at-least-thirty-two-characters',
      API_PORT: '3012',
      BREAK_DURATION_MS: '60000',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public',
      MATCH_SESSION_SECRET:
        'penalty-match-session-secret-with-at-least-thirty-two-characters',
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379/11',
      ROUND_DURATION_MS: '120000',
      WEB_ORIGIN: 'http://localhost:5173',
    });
    const { AppModule } = await import('../app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    penaltyService = module.get(PenaltyService);
    prisma = module.get(PrismaService);
    matchState = module.get(RealtimeMatchStateService);
  });

  afterAll(async () => {
    for (const tournamentId of tournamentIds) {
      await prisma.auditLog.deleteMany({ where: { match: { tournamentId } } });
      await prisma.match.deleteMany({ where: { tournamentId } });
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    await prisma.$disconnect();
  });

  it('makes RED score five become four with one durable violation and audit record', async () => {
    const current = await fixture();
    await prisma.scoreEvent.createMany({
      data: Array.from({ length: 5 }, () => ({
        athleteId: current.athleteIds[AthleteColor.RED],
        matchId: current.matchId,
        type: ScoreEventType.REFEREE_POINT,
        value: 1,
      })),
    });

    const result = await add(current, AthleteColor.RED);
    expect(result.payload.penalty).toMatchObject({
      athlete: AthleteColor.RED,
      roundNumber: 1,
      value: -1,
      violationCount: 1,
    });
    expect(result.scoreUpdated.scores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          athleteId: current.athleteIds[AthleteColor.RED],
          score: 4,
        }),
      ]),
    );
    const [penalty, event, audit, snapshot] = await Promise.all([
      prisma.penalty.findFirstOrThrow({ where: { matchId: current.matchId } }),
      prisma.scoreEvent.findFirstOrThrow({
        where: { matchId: current.matchId, type: ScoreEventType.PENALTY },
      }),
      prisma.auditLog.findFirstOrThrow({
        where: { eventType: 'PENALTY_ACTION', matchId: current.matchId },
      }),
      matchState.snapshot(current.matchId),
    ]);
    expect(event).toMatchObject({ penaltyId: penalty.id, value: -1 });
    expect(audit.sessionId).toBe(current.inspectorSessionId);
    expect(snapshot.athletes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: AthleteColor.RED,
          score: 4,
          violations: 1,
        }),
      ]),
    );
  });

  it('records each explicit consecutive inspector press, including concurrent requests', async () => {
    const current = await fixture();
    const results = await Promise.all([
      add(current, AthleteColor.BLUE),
      add(current, AthleteColor.BLUE),
    ]);
    expect(
      results.map((result) => result.payload.penalty.violationCount).sort(),
    ).toEqual([1, 2]);
    await expect(
      prisma.penalty.count({
        where: { athleteId: current.athleteIds[AthleteColor.BLUE] },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.scoreEvent.aggregate({
        _sum: { value: true },
        where: { athleteId: current.athleteIds[AthleteColor.BLUE] },
      }),
    ).resolves.toMatchObject({ _sum: { value: -2 } });
  });

  it('rejects a referee, inactive inspector, BREAK, FINISHED, and an already-ended round', async () => {
    const current = await fixture();
    await expect(
      penaltyService.addPenalty({
        athlete: AthleteColor.RED,
        matchId: current.matchId,
        sessionId: current.refereeSessionId,
      }),
    ).rejects.toBeInstanceOf(InactivePenaltySessionError);
    await prisma.matchSession.update({
      data: { active: false, revokedAt: new Date() },
      where: { id: current.inspectorSessionId },
    });
    await expect(add(current, AthleteColor.RED)).rejects.toBeInstanceOf(
      InactivePenaltySessionError,
    );

    const breakMatch = await fixture({ status: MatchStatus.BREAK });
    await expect(add(breakMatch, AthleteColor.RED)).rejects.toBeInstanceOf(
      MatchNotRunningForPenaltyError,
    );
    const finishedMatch = await fixture({ status: MatchStatus.FINISHED });
    await expect(add(finishedMatch, AthleteColor.RED)).rejects.toBeInstanceOf(
      MatchNotRunningForPenaltyError,
    );
    const endedMatch = await fixture({ roundEndsAt: new Date(Date.now() - 1) });
    await expect(add(endedMatch, AthleteColor.RED)).rejects.toBeInstanceOf(
      RoundEndedForPenaltyError,
    );
  });
});
