import { Test } from '@nestjs/testing';
import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  MatchStatus,
  RefereeSlot,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  DuplicateRefereeVoteError,
  InactiveVoteSessionError,
  MatchNotRunningForVoteError,
  RoundEndedForVoteError,
} from './scoring.errors';
import { isWithinScoringWindow, ScoringService } from './scoring.service';

const TEST_PREFIX = `scoring-${process.pid}-${Date.now().toString(36)}`;
// The first database transaction can initialize Prisma's connection pool, and
// a failed timer attempt is intentionally retried after one second. Keep this
// integration poll comfortably above that recovery path.
const WINDOW_WAIT_MS = 4_000;

interface Fixture {
  matchId: string;
  sessions: Record<RefereeSlot, string>;
  tournamentId: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('ScoringService (PostgreSQL integration)', () => {
  jest.setTimeout(90_000);

  let prisma: PrismaService;
  let scoring: ScoringService;
  const tournamentIds = new Set<string>();

  async function fixture(options?: {
    roundEndsAt?: Date;
    status?: MatchStatus;
  }): Promise<Fixture> {
    const now = new Date();
    const tournament = await prisma.tournament.create({
      data: { name: `${TEST_PREFIX}-${randomBytes(5).toString('hex')}` },
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
        publicId: randomBytes(6).toString('hex').toUpperCase(),
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
      select: { id: true },
    });
    const accessRoles: Array<[MatchAccessRole, RefereeSlot]> = [
      [MatchAccessRole.REFEREE_1, RefereeSlot.REFEREE_1],
      [MatchAccessRole.REFEREE_2, RefereeSlot.REFEREE_2],
      [MatchAccessRole.REFEREE_3, RefereeSlot.REFEREE_3],
    ];
    const sessions = {} as Record<RefereeSlot, string>;
    for (const [role, slot] of accessRoles) {
      const accessCode = await prisma.matchAccessCode.create({
        data: { codeHash: `test-${role}`, matchId: match.id, role },
        select: { id: true },
      });
      const session = await prisma.matchSession.create({
        data: {
          accessCodeId: accessCode.id,
          active: true,
          deviceId: `${TEST_PREFIX}-${slot}`,
          expiresAt: new Date(now.getTime() + 60_000),
          matchId: match.id,
          refereeSlot: slot,
          role: MatchRole.REFEREE,
          tokenHash: `${randomBytes(18).toString('hex')}-${slot}`,
        },
        select: { id: true },
      });
      sessions[slot] = session.id;
    }
    return { matchId: match.id, sessions, tournamentId: tournament.id };
  }

  async function vote(
    current: Fixture,
    slot: RefereeSlot,
    athlete: AthleteColor,
  ) {
    return scoring.submitVote({
      athlete,
      matchId: current.matchId,
      refereeSlot: slot,
      sessionId: current.sessions[slot],
    });
  }

  async function waitForResolution(matchId: string) {
    const deadline = Date.now() + WINDOW_WAIT_MS;
    while (Date.now() < deadline) {
      const window = await prisma.scoringWindow.findFirst({
        include: { scoreEvents: true },
        orderBy: { startedAt: 'desc' },
        where: { matchId },
      });
      if (window?.resolvedAt !== null && window !== null) {
        return window;
      }
      await sleep(20);
    }
    throw new Error('Timed out waiting for scoring window resolution');
  }

  beforeAll(async () => {
    Object.assign(process.env, {
      ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '100',
      ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
      ADMIN_SESSION_SECRET:
        'scoring-admin-session-secret-with-at-least-thirty-two-characters',
      ADMIN_SESSION_TTL_SECONDS: '3600',
      API_PORT: '3010',
      BREAK_DURATION_MS: '60000',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public',
      MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '100',
      MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: '100',
      MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: '60',
      MATCH_PUBLIC_ID_INITIAL_LENGTH: '6',
      MATCH_SESSION_SECRET:
        'scoring-match-session-secret-with-at-least-thirty-two-characters',
      MATCH_SESSION_TTL_SECONDS: '3600',
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379/11',
      ROUND_DURATION_MS: '120000',
      WEB_ORIGIN: 'http://localhost:5173',
    });
    const { AppModule } = await import('../app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = module.get(PrismaService);
    scoring = module.get(ScoringService);
  });

  afterAll(async () => {
    for (const tournamentId of tournamentIds) {
      await prisma.auditLog.deleteMany({ where: { match: { tournamentId } } });
      await prisma.match.deleteMany({ where: { tournamentId } });
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    if (scoring !== undefined) {
      scoring.onModuleDestroy();
    }
    if (prisma !== undefined) {
      await prisma.$disconnect();
    }
  });

  it('defines the official half-open 0/999/1000/1001ms boundary exactly', () => {
    const startedAt = new Date('2030-01-01T00:00:00.000Z');
    const endsAt = new Date('2030-01-01T00:00:01.000Z');
    expect(isWithinScoringWindow(startedAt, startedAt, endsAt)).toBe(true);
    expect(
      isWithinScoringWindow(
        new Date(startedAt.getTime() + 999),
        startedAt,
        endsAt,
      ),
    ).toBe(true);
    expect(
      isWithinScoringWindow(
        new Date(startedAt.getTime() + 1_000),
        startedAt,
        endsAt,
      ),
    ).toBe(false);
    expect(
      isWithinScoringWindow(
        new Date(startedAt.getTime() + 1_001),
        startedAt,
        endsAt,
      ),
    ).toBe(false);
  });

  it.each([
    [[AthleteColor.RED], null],
    [[AthleteColor.RED, AthleteColor.RED], AthleteColor.RED],
    [[AthleteColor.BLUE, AthleteColor.BLUE], AthleteColor.BLUE],
    [[AthleteColor.RED, AthleteColor.BLUE], null],
    [[AthleteColor.RED, AthleteColor.RED, AthleteColor.BLUE], AthleteColor.RED],
    [
      [AthleteColor.BLUE, AthleteColor.BLUE, AthleteColor.RED],
      AthleteColor.BLUE,
    ],
    [[AthleteColor.RED, AthleteColor.RED, AthleteColor.RED], AthleteColor.RED],
    [
      [AthleteColor.BLUE, AthleteColor.BLUE, AthleteColor.BLUE],
      AthleteColor.BLUE,
    ],
  ])('applies the >=2 majority rule for votes %p', async (votes, winner) => {
    const current = await fixture();
    const slots = [
      RefereeSlot.REFEREE_1,
      RefereeSlot.REFEREE_2,
      RefereeSlot.REFEREE_3,
    ];
    for (const [index, athlete] of votes.entries()) {
      await vote(current, slots[index]!, athlete);
    }
    const window = await waitForResolution(current.matchId);
    expect(window.winningColor).toBe(winner);
    expect(window.scoreAwarded).toBe(winner !== null);
    expect(window.scoreEvents).toHaveLength(winner === null ? 0 : 1);
  });

  it('proves the acceptance demonstration and immediately resolves a consecutive window', async () => {
    const current = await fixture();
    const first = await vote(current, RefereeSlot.REFEREE_1, AthleteColor.RED);
    await sleep(250);
    await vote(current, RefereeSlot.REFEREE_2, AthleteColor.RED);
    await sleep(400);
    await vote(current, RefereeSlot.REFEREE_3, AthleteColor.BLUE);
    const firstWindow = await waitForResolution(current.matchId);
    expect(first.accepted.scoringWindowId).toBe(firstWindow.id);
    expect(firstWindow.winningColor).toBe(AthleteColor.RED);
    expect(firstWindow.scoreEvents).toHaveLength(1);

    const next = await vote(current, RefereeSlot.REFEREE_1, AthleteColor.BLUE);
    await vote(current, RefereeSlot.REFEREE_2, AthleteColor.BLUE);
    const secondWindow = await waitForResolution(current.matchId);
    expect(next.accepted.scoringWindowId).toBe(secondWindow.id);
    expect(secondWindow.id).not.toBe(firstWindow.id);
    expect(secondWindow.winningColor).toBe(AthleteColor.BLUE);
    await expect(
      prisma.scoreEvent.count({ where: { matchId: current.matchId } }),
    ).resolves.toBe(2);
  });

  it('enforces duplicate, concurrent first-vote, state, expiry, and session validity rules', async () => {
    const current = await fixture();
    const duplicate = await Promise.allSettled([
      vote(current, RefereeSlot.REFEREE_1, AthleteColor.RED),
      vote(current, RefereeSlot.REFEREE_1, AthleteColor.RED),
    ]);
    expect(
      duplicate.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      duplicate.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: expect.any(DuplicateRefereeVoteError),
    });
    await expect(
      prisma.scoringWindow.count({ where: { matchId: current.matchId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.refereeVote.count({ where: { matchId: current.matchId } }),
    ).resolves.toBe(1);

    await prisma.match.update({
      data: { status: MatchStatus.BREAK },
      where: { id: current.matchId },
    });
    await expect(
      vote(current, RefereeSlot.REFEREE_2, AthleteColor.RED),
    ).rejects.toBeInstanceOf(MatchNotRunningForVoteError);
    await prisma.match.update({
      data: { status: MatchStatus.FINISHED },
      where: { id: current.matchId },
    });
    await expect(
      vote(current, RefereeSlot.REFEREE_3, AthleteColor.RED),
    ).rejects.toBeInstanceOf(MatchNotRunningForVoteError);
    await prisma.matchSession.update({
      data: { active: false, revokedAt: new Date() },
      where: { id: current.sessions[RefereeSlot.REFEREE_2] },
    });
    await expect(
      vote(current, RefereeSlot.REFEREE_2, AthleteColor.RED),
    ).rejects.toBeInstanceOf(InactiveVoteSessionError);

    const ended = await fixture({ roundEndsAt: new Date(Date.now() - 1) });
    await expect(
      vote(ended, RefereeSlot.REFEREE_1, AthleteColor.RED),
    ).rejects.toBeInstanceOf(RoundEndedForVoteError);
  });

  it('resolves overdue persisted windows safely during recovery and only awards one point', async () => {
    const current = await fixture();
    const now = new Date();
    const window = await prisma.scoringWindow.create({
      data: {
        endsAt: new Date(now.getTime() - 1),
        matchId: current.matchId,
        roundNumber: 1,
        startedAt: new Date(now.getTime() - 1_001),
      },
    });
    await prisma.refereeVote.createMany({
      data: [
        {
          athleteColor: AthleteColor.RED,
          matchId: current.matchId,
          refereeSlot: RefereeSlot.REFEREE_1,
          scoringWindowId: window.id,
          serverReceivedAt: new Date(now.getTime() - 900),
          sessionId: current.sessions[RefereeSlot.REFEREE_1],
        },
        {
          athleteColor: AthleteColor.RED,
          matchId: current.matchId,
          refereeSlot: RefereeSlot.REFEREE_2,
          scoringWindowId: window.id,
          serverReceivedAt: new Date(now.getTime() - 700),
          sessionId: current.sessions[RefereeSlot.REFEREE_2],
        },
        {
          athleteColor: AthleteColor.BLUE,
          matchId: current.matchId,
          refereeSlot: RefereeSlot.REFEREE_3,
          scoringWindowId: window.id,
          serverReceivedAt: new Date(now.getTime() - 350),
          sessionId: current.sessions[RefereeSlot.REFEREE_3],
        },
      ],
    });
    await Promise.all([
      scoring.initializeResolutionRecovery(async () => undefined),
      scoring.initializeResolutionRecovery(async () => undefined),
    ]);
    const recovered = await prisma.scoringWindow.findUniqueOrThrow({
      include: { scoreEvents: true },
      where: { id: window.id },
    });
    expect(recovered.winningColor).toBe(AthleteColor.RED);
    expect(recovered.scoreEvents).toHaveLength(1);
  });
});
