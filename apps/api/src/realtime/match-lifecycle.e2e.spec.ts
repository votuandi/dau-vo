import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AthleteColor,
  MatchAccessRole,
  MatchStatus,
  PrismaClient,
} from '@prisma/client';
import {
  RealtimeEvent,
  type MatchFinishedPayload,
  type MatchStatePayload,
  type RoundEndedPayload,
  type RoundStartedPayload,
  type RoundStartResponse,
  type RoundControlResponse,
  type ResultCancellationResponse,
  type ResultCancellationUndoResponse,
} from '@martial-arts-scoring/shared-types';
import { hash } from 'bcryptjs';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/10';
const SOCKET_PATH = '/api/socket.io';
const EVENT_TIMEOUT_MS = 7_500;
const TEST_RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const TEST_PREFIX = `match-lifecycle-e2e-${TEST_RUN_ID}`;
const ALL_ACCESS_ROLES = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const;

interface TestMatch {
  id: string;
  publicId: string;
  rawCodes: Record<MatchAccessRole, string>;
  roundDurationMs: number;
}

interface LoginResult {
  cookie: string;
  sessionId: string;
}

interface LoginResponseBody {
  session: {
    sessionId: string;
  };
}

interface SocketAuthenticationError extends Error {
  data?: {
    code?: unknown;
  };
}

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '100',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    ADMIN_SESSION_SECRET:
      'lifecycle-admin-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3005',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: TEST_DATABASE_URL,
    MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '100',
    MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: '1000',
    MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: '60',
    MATCH_PUBLIC_ID_INITIAL_LENGTH: '6',
    MATCH_SESSION_SECRET:
      'lifecycle-match-session-secret-with-at-least-thirty-two-characters',
    MATCH_SESSION_TTL_SECONDS: '3600',
    NODE_ENV: 'test',
    REDIS_URL: TEST_REDIS_URL,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'];
  const serialized = Array.isArray(setCookie)
    ? String(setCookie[0])
    : String(setCookie ?? '');
  const cookie = serialized.split(';')[0] ?? '';

  if (!cookie.includes('=')) {
    throw new Error('Match login did not return a session cookie');
  }

  return cookie;
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Socket.IO connection'));
    }, EVENT_TIMEOUT_MS);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for Socket.IO event ${event}`));
    }, EVENT_TIMEOUT_MS);
    const listener = (payload: T): void => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };

    socket.on(event, listener);
  });
}

function startRound(socket: Socket): Promise<RoundStartResponse> {
  return new Promise<RoundStartResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for round:start response')),
      EVENT_TIMEOUT_MS,
    );

    socket.emit(RealtimeEvent.ROUND_START, (response: RoundStartResponse) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function controlRound(
  socket: Socket,
  event: 'round:pause' | 'round:resume',
): Promise<RoundControlResponse> {
  return new Promise<RoundControlResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} response`)),
      EVENT_TIMEOUT_MS,
    );
    socket.emit(event, (response: RoundControlResponse) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function cancelResults(
  socket: Socket,
  event: 'round:cancel' | 'match:reset',
): Promise<ResultCancellationResponse> {
  return new Promise<ResultCancellationResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event} response`)),
      EVENT_TIMEOUT_MS,
    );
    socket.emit(event, (response: ResultCancellationResponse) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function undoResultCancellation(
  socket: Socket,
  operationId: string,
): Promise<ResultCancellationUndoResponse> {
  return new Promise<ResultCancellationUndoResponse>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error('Timed out waiting for result cancellation undo response'),
        ),
      EVENT_TIMEOUT_MS,
    );
    socket.emit(
      RealtimeEvent.RESULT_CANCELLATION_UNDO,
      { operationId },
      (response: ResultCancellationUndoResponse) => {
        clearTimeout(timer);
        resolve(response);
      },
    );
  });
}

async function waitUntil<T>(
  query: () => Promise<T>,
  predicate: (value: T) => boolean,
  description: string,
): Promise<T> {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const value = await query();

    if (predicate(value)) {
      return value;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${description}`);
}

describe('Match lifecycle and authoritative round timing (integration)', () => {
  jest.setTimeout(90_000);

  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let tournamentId: string;
  let recoveredRoundOneMatchId: string;
  let recoveredRoundTwoMatchId: string;
  const sockets = new Set<Socket>();
  const testMatchIds = new Set<string>();

  async function createMatch(
    label: string,
    roundDurationMs = 300,
  ): Promise<TestMatch> {
    const rawCodes = Object.fromEntries(
      ALL_ACCESS_ROLES.map((role) => [
        role,
        `${role.slice(0, 3)}-${randomBytes(12).toString('base64url')}`,
      ]),
    ) as Record<MatchAccessRole, string>;
    const accessCodes = await Promise.all(
      ALL_ACCESS_ROLES.map(async (role) => ({
        codeHash: await hash(rawCodes[role], 4),
        role,
      })),
    );
    const match = await prisma.match.create({
      data: {
        accessCodes: { create: accessCodes },
        athletes: {
          create: [
            {
              color: AthleteColor.RED,
              name: `${TEST_PREFIX}-${label}-red`,
              organization: 'Red lifecycle test club',
            },
            {
              color: AthleteColor.BLUE,
              name: `${TEST_PREFIX}-${label}-blue`,
              organization: 'Blue lifecycle test club',
            },
          ],
        },
        breakDurationMs: 60_000,
        publicId: randomBytes(6).toString('hex').slice(0, 8).toUpperCase(),
        roundDurationMs,
        tournamentId,
      },
      select: { id: true, publicId: true, roundDurationMs: true },
    });
    testMatchIds.add(match.id);

    return { ...match, rawCodes };
  }

  async function login(
    match: TestMatch,
    role: MatchAccessRole,
    deviceLabel: string,
  ): Promise<LoginResult> {
    const response = await request(app.getHttpServer())
      .post('/api/match-access/login')
      .send({
        deviceId: `${TEST_PREFIX}-${deviceLabel}`,
        matchId: match.publicId,
        securityCode: match.rawCodes[role],
      })
      .expect(200);

    return {
      cookie: cookieFrom(response),
      sessionId: (response.body as LoginResponseBody).session.sessionId,
    };
  }

  function socketClient(cookie?: string): Socket {
    const socket = io(baseUrl, {
      autoConnect: false,
      extraHeaders:
        cookie === undefined
          ? undefined
          : {
              Cookie: cookie,
            },
      forceNew: true,
      path: SOCKET_PATH,
      reconnection: false,
      timeout: 2_500,
      transports: ['websocket'],
    });
    sockets.add(socket);

    return socket;
  }

  async function connect(cookie: string): Promise<Socket> {
    const socket = socketClient(cookie);
    const connected = waitForConnect(socket);
    socket.connect();
    await connected;

    return socket;
  }

  async function connectScoreboard(publicMatchId: string): Promise<Socket> {
    const socket = io(baseUrl, {
      auth: { matchPublicId: publicMatchId, mode: 'scoreboard' },
      autoConnect: false,
      forceNew: true,
      path: SOCKET_PATH,
      reconnection: false,
      timeout: 2_500,
      transports: ['websocket'],
    });
    sockets.add(socket);
    const connected = waitForConnect(socket);
    socket.connect();
    await connected;
    return socket;
  }

  async function requestSnapshot(socket: Socket): Promise<MatchStatePayload> {
    const snapshot = waitForEvent<MatchStatePayload>(
      socket,
      RealtimeEvent.MATCH_STATE,
    );
    socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    return snapshot;
  }

  async function connectRequiredPresence(
    match: TestMatch,
    inspectorSocket: Socket,
    label: string,
  ): Promise<void> {
    const refereeLogins = await Promise.all(
      [
        MatchAccessRole.REFEREE_1,
        MatchAccessRole.REFEREE_2,
        MatchAccessRole.REFEREE_3,
      ].map((role) => login(match, role, `${label}-${role}`)),
    );
    await Promise.all(refereeLogins.map(({ cookie }) => connect(cookie)));
    await connectScoreboard(match.publicId);

    await waitUntil(
      () => requestSnapshot(inspectorSocket),
      (snapshot) =>
        snapshot.scoreboardConnectedCount >= 1 &&
        [
          MatchAccessRole.REFEREE_1,
          MatchAccessRole.REFEREE_2,
          MatchAccessRole.REFEREE_3,
        ].every((role) =>
          snapshot.presence.some(
            (entry) => entry.accessRole === role && entry.connected,
          ),
        ),
      'required round-start presence',
    );
  }

  async function auditEventNames(matchId: string): Promise<string[]> {
    const audits = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
      select: { eventType: true },
      where: { matchId },
    });

    return audits.map(({ eventType }) => String(eventType));
  }

  beforeAll(async () => {
    configureTestEnvironment();

    redis = new Redis(TEST_REDIS_URL, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    await redis.flushdb();

    // These fixtures exist before Nest starts so its recovery hook must handle
    // persisted overdue work instead of relying on an in-memory timer.
    const setupPrisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
    await setupPrisma.$connect();

    try {
      await setupPrisma.user.upsert({
        where: { id: '00000000-0000-4000-8000-000000000001' },
        update: {},
        create: {
          id: '00000000-0000-4000-8000-000000000001',
          username: 'realtime-fixture-owner',
          normalizedUsername: 'realtime-fixture-owner',
          passwordHash: 'not-a-real-login-hash',
        },
      });
      const tournament = await setupPrisma.tournament.create({
        data: {
          name: `${TEST_PREFIX}-tournament`,
          ownerUserId: '00000000-0000-4000-8000-000000000001',
        },
        select: { id: true },
      });
      tournamentId = tournament.id;
      const now = Date.now();
      const roundOneStartedAt = new Date(now - 2_000);
      const roundOneEndsAt = new Date(now - 1_500);
      const recoveredRoundOne = await setupPrisma.match.create({
        data: {
          breakDurationMs: 60_000,
          currentRound: 1,
          publicId: randomBytes(6).toString('hex').slice(0, 8).toUpperCase(),
          roundDurationMs: 500,
          rounds: {
            create: {
              endsAt: roundOneEndsAt,
              roundNumber: 1,
              startedAt: roundOneStartedAt,
            },
          },
          startedAt: roundOneStartedAt,
          status: MatchStatus.ROUND_1_RUNNING,
          tournamentId,
        },
        select: { id: true },
      });
      recoveredRoundOneMatchId = recoveredRoundOne.id;
      const roundTwoStartedAt = new Date(now - 1_500);
      const roundTwoEndsAt = new Date(now - 1_000);
      const recoveredRoundTwo = await setupPrisma.match.create({
        data: {
          breakDurationMs: 60_000,
          currentRound: 2,
          publicId: randomBytes(6).toString('hex').slice(0, 8).toUpperCase(),
          roundDurationMs: 500,
          rounds: {
            create: {
              endsAt: roundTwoEndsAt,
              roundNumber: 2,
              startedAt: roundTwoStartedAt,
            },
          },
          startedAt: new Date(now - 5_000),
          status: MatchStatus.ROUND_2_RUNNING,
          tournamentId,
        },
        select: { id: true },
      });
      recoveredRoundTwoMatchId = recoveredRoundTwo.id;
    } finally {
      await setupPrisma.$disconnect();
    }

    const [{ AppModule }, { configureApplication }] = await Promise.all([
      import('../app.module'),
      import('../configure-application'),
    ]);
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(
      app,
      app.get(ConfigService<EnvironmentVariables, true>),
    );
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo | null;

    if (address === null) {
      throw new Error('Nest test server did not expose a network address');
    }

    baseUrl = `http://127.0.0.1:${String(address.port)}`;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    sockets.clear();

    const ids = [...testMatchIds];

    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { matchId: { in: ids } } });
      await prisma.match.deleteMany({ where: { id: { in: ids } } });
      testMatchIds.clear();
    }
  });

  afterAll(async () => {
    if (prisma !== undefined && tournamentId !== undefined) {
      await prisma.auditLog.deleteMany({ where: { match: { tournamentId } } });
      await prisma.match.deleteMany({ where: { tournamentId } });
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    if (app !== undefined) {
      await app.close();
    }
    if (redis !== undefined) {
      await redis.flushdb();
      await redis.quit();
    }
  });

  it('recovers overdue persisted rounds on startup without relying on old timers', async () => {
    const [roundOneMatch, roundTwoMatch] = await Promise.all([
      waitUntil(
        () =>
          prisma.match.findUniqueOrThrow({
            include: { rounds: true },
            where: { id: recoveredRoundOneMatchId },
          }),
        (match) => match.status === MatchStatus.BREAK,
        'overdue Round 1 recovery',
      ),
      waitUntil(
        () =>
          prisma.match.findUniqueOrThrow({
            include: { rounds: true },
            where: { id: recoveredRoundTwoMatchId },
          }),
        (match) => match.status === MatchStatus.FINISHED,
        'overdue Round 2 recovery',
      ),
    ]);

    expect(roundOneMatch.rounds[0]?.endedAt).not.toBeNull();
    expect(roundTwoMatch.rounds[0]?.endedAt).not.toBeNull();
    expect(roundTwoMatch.finishedAt).not.toBeNull();
    expect(roundOneMatch.rounds[0]?.endedAt).toEqual(
      roundOneMatch.rounds[0]?.endsAt,
    );
    expect(roundTwoMatch.rounds[0]?.endedAt).toEqual(
      roundTwoMatch.rounds[0]?.endsAt,
    );
    expect(roundTwoMatch.finishedAt).toEqual(roundTwoMatch.rounds[0]?.endsAt);
    await expect(auditEventNames(recoveredRoundOneMatchId)).resolves.toContain(
      'ROUND_ENDED',
    );
    await expect(auditEventNames(recoveredRoundTwoMatchId)).resolves.toEqual(
      expect.arrayContaining(['ROUND_ENDED', 'MATCH_FINISHED']),
    );
  });

  it('lets the inspector run Round 1, break, Round 2, and finish exactly once', async () => {
    // The flow awaits multiple socket broadcasts before the invalid-transition
    // check, so allow real database/socket scheduling margin here.
    const match = await createMatch('complete-flow', 2_000);
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'complete-flow-inspector',
    );
    const socket = await connect(inspector.cookie);
    await connectRequiredPresence(match, socket, 'complete-flow-ready');
    const roundOneStartedEvent = waitForEvent<RoundStartedPayload>(
      socket,
      RealtimeEvent.ROUND_STARTED,
      (payload) => payload.matchPublicId === match.publicId,
    );
    const roundOneStateEvent = waitForEvent<MatchStatePayload>(
      socket,
      RealtimeEvent.MATCH_STATE,
      (payload) =>
        payload.match.publicId === match.publicId &&
        payload.match.status === MatchStatus.ROUND_1_RUNNING,
    );
    const roundOneEndedEvent = waitForEvent<RoundEndedPayload>(
      socket,
      RealtimeEvent.ROUND_ENDED,
      (payload) =>
        payload.matchPublicId === match.publicId &&
        payload.round.roundNumber === 1,
    );

    const roundOneResponse = await startRound(socket);
    expect(roundOneResponse.ok).toBe(true);
    const [roundOneStarted, roundOneState] = await Promise.all([
      roundOneStartedEvent,
      roundOneStateEvent,
    ]);
    expect(roundOneStarted).toMatchObject({
      matchPublicId: match.publicId,
      status: MatchStatus.ROUND_1_RUNNING,
    });
    expect(roundOneStarted.round.roundNumber).toBe(1);
    expect(roundOneState.activeRound?.roundNumber).toBe(1);

    const prematureRoundTwo = await startRound(socket);
    expect(prematureRoundTwo).toMatchObject({
      error: { code: 'ROUND_START_INVALID_STATE' },
      ok: false,
    });

    const roundOneEnded = await roundOneEndedEvent;
    expect(roundOneEnded).toMatchObject({
      matchPublicId: match.publicId,
      status: MatchStatus.BREAK,
    });

    const roundTwoStartedEvent = waitForEvent<RoundStartedPayload>(
      socket,
      RealtimeEvent.ROUND_STARTED,
      (payload) =>
        payload.matchPublicId === match.publicId &&
        payload.round.roundNumber === 2,
    );
    const roundTwoEndedEvent = waitForEvent<RoundEndedPayload>(
      socket,
      RealtimeEvent.ROUND_ENDED,
      (payload) =>
        payload.matchPublicId === match.publicId &&
        payload.round.roundNumber === 2,
    );
    const matchFinishedEvent = waitForEvent<MatchFinishedPayload>(
      socket,
      RealtimeEvent.MATCH_FINISHED,
      (payload) => payload.matchPublicId === match.publicId,
    );
    const roundTwoResponse = await startRound(socket);
    expect(roundTwoResponse.ok).toBe(true);
    const roundTwoStarted = await roundTwoStartedEvent;
    expect(roundTwoStarted.status).toBe(MatchStatus.ROUND_2_RUNNING);

    const [roundTwoEnded, matchFinished] = await Promise.all([
      roundTwoEndedEvent,
      matchFinishedEvent,
    ]);
    expect(roundTwoEnded.status).toBe(MatchStatus.FINISHED);
    expect(new Date(matchFinished.finishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(roundTwoEnded.round.endsAt).getTime(),
    );

    const afterFinished = await startRound(socket);
    expect(afterFinished).toMatchObject({
      error: { code: 'ROUND_START_INVALID_STATE' },
      ok: false,
    });

    const persisted = await prisma.match.findUniqueOrThrow({
      include: { rounds: { orderBy: { roundNumber: 'asc' } } },
      where: { id: match.id },
    });
    expect(persisted).toMatchObject({
      currentRound: 2,
      status: MatchStatus.FINISHED,
    });
    expect(persisted.rounds).toHaveLength(2);
    expect(persisted.rounds.map(({ roundNumber }) => roundNumber)).toEqual([
      1, 2,
    ]);
    expect(persisted.rounds.every(({ endedAt }) => endedAt !== null)).toBe(
      true,
    );

    const auditEvents = await auditEventNames(match.id);
    expect(
      auditEvents.filter((event) => event === 'ROUND_STARTED'),
    ).toHaveLength(2);
    expect(auditEvents.filter((event) => event === 'ROUND_ENDED')).toHaveLength(
      2,
    );
    expect(
      auditEvents.filter((event) => event === 'MATCH_FINISHED'),
    ).toHaveLength(1);
  });

  it('uses the match duration and never expires a round before its persisted endsAt', async () => {
    // Keep enough margin for a real database read on a busy CI/local machine.
    // The assertion verifies persisted timing, not event-loop scheduling speed.
    const match = await createMatch('authoritative-time', 2_000);
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'authoritative-time-inspector',
    );
    const socket = await connect(inspector.cookie);
    await connectRequiredPresence(match, socket, 'authoritative-time-ready');
    const endedEvent = waitForEvent<RoundEndedPayload>(
      socket,
      RealtimeEvent.ROUND_ENDED,
      (payload) => payload.matchPublicId === match.publicId,
    );

    const response = await startRound(socket);
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error('Inspector Round 1 start unexpectedly failed');
    }

    const startedAt = new Date(response.round.startedAt).getTime();
    const endsAt = new Date(response.round.endsAt).getTime();
    expect(endsAt - startedAt).toBe(match.roundDurationMs);

    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    const beforeDeadline = await prisma.match.findUniqueOrThrow({
      select: { status: true },
      where: { id: match.id },
    });
    expect(beforeDeadline.status).toBe(MatchStatus.ROUND_1_RUNNING);

    const ended = await endedEvent;
    const endedAt = new Date(ended.round.endedAt ?? '').getTime();
    expect(Date.now()).toBeGreaterThanOrEqual(endsAt);
    expect(endedAt).toBe(endsAt);

    const persistedRound = await prisma.round.findFirstOrThrow({
      where: { invalidatedAt: null, matchId: match.id, roundNumber: 1 },
    });
    expect(persistedRound.startedAt.getTime()).toBe(startedAt);
    expect(persistedRound.endsAt.getTime()).toBe(endsAt);
    expect(persistedRound.endedAt?.getTime()).toBe(endsAt);
  });

  it('rejects referee and unauthenticated scoreboard round commands', async () => {
    const match = await createMatch('permissions', 250);
    const referee = await login(
      match,
      MatchAccessRole.REFEREE_1,
      'permissions-referee',
    );
    const refereeSocket = await connect(referee.cookie);

    await expect(startRound(refereeSocket)).resolves.toMatchObject({
      error: { code: 'ROUND_START_FORBIDDEN' },
      ok: false,
    });

    const scoreboardSocket = socketClient();
    const authenticationFailure = new Promise<SocketAuthenticationError>(
      (resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error('Unauthenticated scoreboard was not rejected')),
          EVENT_TIMEOUT_MS,
        );

        scoreboardSocket.once('connect', () => {
          clearTimeout(timer);
          reject(
            new Error('Unauthenticated scoreboard unexpectedly connected'),
          );
        });
        scoreboardSocket.once('connect_error', (error: Error) => {
          clearTimeout(timer);
          resolve(error as SocketAuthenticationError);
        });
      },
    );
    scoreboardSocket.connect();

    await expect(authenticationFailure).resolves.toMatchObject({
      data: { code: 'REALTIME_AUTHENTICATION_REQUIRED' },
    });
    await expect(
      prisma.round.count({ where: { matchId: match.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.match.findUniqueOrThrow({
        select: { status: true },
        where: { id: match.id },
      }),
    ).resolves.toEqual({ status: MatchStatus.WAITING });
  });

  it('serializes simultaneous inspector starts so only one Round 1 is created', async () => {
    const match = await createMatch('concurrent-start', 300);
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'concurrent-start-inspector',
    );
    const [firstSocket, secondSocket] = await Promise.all([
      connect(inspector.cookie),
      connect(inspector.cookie),
    ]);
    await connectRequiredPresence(match, firstSocket, 'concurrent-start-ready');
    const roundEnded = waitForEvent<RoundEndedPayload>(
      firstSocket,
      RealtimeEvent.ROUND_ENDED,
      (payload) => payload.matchPublicId === match.publicId,
    );

    const responses = await Promise.all([
      startRound(firstSocket),
      startRound(secondSocket),
    ]);
    expect(responses.filter(({ ok }) => ok)).toHaveLength(1);
    expect(responses.filter(({ ok }) => !ok)).toEqual([
      expect.objectContaining({
        error: expect.objectContaining({ code: 'ROUND_START_INVALID_STATE' }),
        ok: false,
      }),
    ]);
    await roundEnded;

    await expect(
      prisma.round.count({ where: { matchId: match.id, roundNumber: 1 } }),
    ).resolves.toBe(1);
    const audits = await auditEventNames(match.id);
    expect(audits.filter((event) => event === 'ROUND_STARTED')).toHaveLength(1);
  });

  it('persists pause duration, rejects invalid controls, and resumes with a new deadline', async () => {
    const match = await createMatch('pause-resume', 2_000);
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'pause-resume-inspector',
    );
    const socket = await connect(inspector.cookie);
    await connectRequiredPresence(match, socket, 'pause-resume-ready');
    const started = await startRound(socket);
    expect(started.ok).toBe(true);

    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    const paused = await controlRound(socket, RealtimeEvent.ROUND_PAUSE);
    expect(paused).toMatchObject({
      ok: true,
      round: {
        pausedAt: expect.any(String),
        remainingDurationMs: expect.any(Number),
      },
    });
    if (!paused.ok) throw new Error('Pause unexpectedly failed');
    expect(paused.round.remainingDurationMs).toBeGreaterThan(0);
    expect(paused.round.remainingDurationMs).toBeLessThan(
      match.roundDurationMs,
    );

    const persistedPause = await prisma.match.findUniqueOrThrow({
      include: { rounds: { where: { roundNumber: 1 } } },
      where: { id: match.id },
    });
    expect(persistedPause.status).toBe(MatchStatus.ROUND_1_PAUSED);
    expect(persistedPause.rounds[0]?.pausedAt).not.toBeNull();
    expect(persistedPause.rounds[0]?.remainingDurationMs).toBe(
      paused.round.remainingDurationMs,
    );
    await expect(
      controlRound(socket, RealtimeEvent.ROUND_PAUSE),
    ).resolves.toMatchObject({
      error: { code: 'ROUND_CONTROL_INVALID_STATE' },
      ok: false,
    });

    const resumedAt = Date.now();
    const resumed = await controlRound(socket, RealtimeEvent.ROUND_RESUME);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error('Resume unexpectedly failed');
    expect(new Date(resumed.round.endsAt).getTime()).toBeGreaterThan(resumedAt);
    expect(resumed.round.pausedAt).toBeNull();
    expect(resumed.round.remainingDurationMs).toBeNull();
    await expect(
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'asc' },
        select: { eventType: true, metadata: true, sessionId: true },
        where: { matchId: match.id },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'ROUND_PAUSED',
          sessionId: inspector.sessionId,
        }),
        expect.objectContaining({
          eventType: 'ROUND_RESUMED',
          sessionId: inspector.sessionId,
        }),
      ]),
    );
    await expect(
      controlRound(socket, RealtimeEvent.ROUND_RESUME),
    ).resolves.toMatchObject({
      error: { code: 'ROUND_CONTROL_INVALID_STATE' },
      ok: false,
    });
  });

  it('cancels Round 1 without deleting history and permits a presence-gated new attempt', async () => {
    const match = await createMatch('cancel-round-one', 500);
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'cancel-r1-inspector',
    );
    const socket = await connect(inspector.cookie);
    await prisma.match.update({
      data: {
        currentRound: 1,
        startedAt: new Date(),
        status: MatchStatus.BREAK,
      },
      where: { id: match.id },
    });
    const round = await prisma.round.create({
      data: {
        endedAt: new Date(),
        endsAt: new Date(),
        matchId: match.id,
        roundNumber: 1,
        startedAt: new Date(Date.now() - 1_000),
      },
    });
    const athlete = await prisma.matchAthlete.findFirstOrThrow({
      where: { color: AthleteColor.RED, matchId: match.id },
    });
    await prisma.scoreEvent.create({
      data: {
        athleteId: athlete.id,
        matchId: match.id,
        roundNumber: 1,
        type: 'REFEREE_POINT',
        value: 3,
      },
    });

    const cancelled = await cancelResults(socket, RealtimeEvent.ROUND_CANCEL);
    expect(cancelled).toMatchObject({
      action: { roundNumbers: [1], status: 'WAITING' },
      ok: true,
    });
    if (!cancelled.ok)
      throw new Error('Round cancellation unexpectedly failed');
    await expect(
      prisma.round.findUniqueOrThrow({ where: { id: round.id } }),
    ).resolves.toMatchObject({
      invalidatedAt: expect.any(Date),
      invalidatedByAuditId: expect.any(String),
    });
    await expect(
      prisma.scoreEvent.findFirstOrThrow({ where: { matchId: match.id } }),
    ).resolves.toMatchObject({
      revertedAt: expect.any(Date),
      revertedByAuditId: expect.any(String),
    });
    await expect(startRound(socket)).resolves.toMatchObject({
      error: { code: 'MATCH_PARTICIPANTS_NOT_READY' },
      ok: false,
    });
    await connectRequiredPresence(match, socket, 'cancel-r1-restart-ready');
    await expect(startRound(socket)).resolves.toMatchObject({
      ok: true,
      round: { roundNumber: 1 },
    });
    await expect(
      prisma.round.count({ where: { matchId: match.id, roundNumber: 1 } }),
    ).resolves.toBe(2);
    await expect(
      undoResultCancellation(socket, cancelled.action.actionId),
    ).resolves.toMatchObject({
      error: { code: 'RESET_UNDO_NOT_ALLOWED' },
      ok: false,
    });
  });

  it('resets both finished rounds to zero effective scores and violations while preserving records', async () => {
    const match = await createMatch('reset-entire-match');
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'reset-match-inspector',
    );
    const socket = await connect(inspector.cookie);
    const athletes = await prisma.matchAthlete.findMany({
      where: { matchId: match.id },
    });
    const red = athletes.find(({ color }) => color === AthleteColor.RED);
    if (red === undefined) throw new Error('Missing red athlete');
    const now = new Date();
    await prisma.match.update({
      data: {
        currentRound: 2,
        finishedAt: now,
        startedAt: new Date(now.getTime() - 5_000),
        status: MatchStatus.FINISHED,
      },
      where: { id: match.id },
    });
    await prisma.round.createMany({
      data: [1, 2].map((roundNumber) => ({
        endedAt: now,
        endsAt: now,
        matchId: match.id,
        roundNumber,
        startedAt: new Date(now.getTime() - 2_000),
      })),
    });
    const penalty = await prisma.penalty.create({
      data: {
        athleteId: red.id,
        createdBySessionId: inspector.sessionId,
        matchId: match.id,
        roundNumber: 2,
        value: -1,
      },
    });
    await prisma.scoreEvent.createMany({
      data: [
        {
          athleteId: red.id,
          matchId: match.id,
          roundNumber: 1,
          type: 'REFEREE_POINT',
          value: 5,
        },
        {
          athleteId: red.id,
          matchId: match.id,
          penaltyId: penalty.id,
          roundNumber: 2,
          type: 'PENALTY',
          value: -1,
        },
        {
          athleteId: red.id,
          matchId: match.id,
          roundNumber: null,
          type: 'ADMIN_ADJUSTMENT',
          value: 2,
        },
      ],
    });

    const cancelled = await cancelResults(socket, RealtimeEvent.MATCH_RESET);
    expect(cancelled).toMatchObject({
      action: { roundNumbers: [1, 2], status: 'WAITING' },
      ok: true,
    });
    if (!cancelled.ok) throw new Error('Match reset unexpectedly failed');
    const snapshot = await requestSnapshot(socket);
    expect(snapshot.match).toMatchObject({
      currentRound: null,
      finishedAt: null,
      startedAt: null,
      status: 'WAITING',
    });
    expect(
      snapshot.athletes.find(({ color }) => color === 'RED'),
    ).toMatchObject({ score: 0, violations: 0 });
    await expect(
      prisma.round.count({
        where: { invalidatedAt: { not: null }, matchId: match.id },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.scoreEvent.count({
        where: { matchId: match.id, revertedAt: { not: null } },
      }),
    ).resolves.toBe(3);
    await expect(
      prisma.penalty.count({
        where: { matchId: match.id, revertedAt: { not: null } },
      }),
    ).resolves.toBe(1);
    socket.disconnect();
    const refreshedSocket = await connect(inspector.cookie);
    await expect(
      undoResultCancellation(refreshedSocket, cancelled.action.actionId),
    ).resolves.toMatchObject({
      ok: true,
      undo: { operationId: cancelled.action.actionId, status: 'FINISHED' },
    });
    const restoredSnapshot = await requestSnapshot(refreshedSocket);
    expect(restoredSnapshot.match).toMatchObject({
      currentRound: 2,
      status: 'FINISHED',
    });
    expect(
      restoredSnapshot.athletes.find(({ color }) => color === 'RED'),
    ).toMatchObject({ score: 6, violations: 1 });
    await expect(
      prisma.auditLog.findMany({
        select: { eventType: true, metadata: true, sessionId: true },
        where: { matchId: match.id },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'MATCH_RESULT_RESET',
          metadata: expect.objectContaining({
            resetOperationId: cancelled.action.actionId,
          }),
          sessionId: inspector.sessionId,
        }),
        expect.objectContaining({
          eventType: 'MATCH_RESULT_RESET_UNDONE',
          metadata: expect.objectContaining({
            resetOperationId: cancelled.action.actionId,
          }),
          sessionId: inspector.sessionId,
        }),
      ]),
    );
    await expect(
      undoResultCancellation(refreshedSocket, cancelled.action.actionId),
    ).resolves.toMatchObject({
      error: { code: 'RESET_UNDO_NOT_ALLOWED' },
      ok: false,
    });
  });

  it('restores only Round 1 points and penalties when its cancellation is undone', async () => {
    const match = await createMatch('undo-round-one');
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'undo-r1-inspector',
    );
    const socket = await connect(inspector.cookie);
    const athletes = await prisma.matchAthlete.findMany({
      where: { matchId: match.id },
    });
    const red = athletes.find(({ color }) => color === AthleteColor.RED);
    const blue = athletes.find(({ color }) => color === AthleteColor.BLUE);
    if (red === undefined || blue === undefined)
      throw new Error('Missing athletes');
    const now = new Date();
    await prisma.match.update({
      data: { currentRound: 1, startedAt: now, status: MatchStatus.BREAK },
      where: { id: match.id },
    });
    await prisma.round.create({
      data: {
        endedAt: now,
        endsAt: now,
        matchId: match.id,
        roundNumber: 1,
        startedAt: new Date(now.getTime() - 1_000),
      },
    });
    const penalty = await prisma.penalty.create({
      data: {
        athleteId: red.id,
        createdBySessionId: inspector.sessionId,
        matchId: match.id,
        roundNumber: 1,
      },
    });
    await prisma.scoreEvent.createMany({
      data: [
        {
          athleteId: red.id,
          matchId: match.id,
          roundNumber: 1,
          type: 'REFEREE_POINT',
          value: 3,
        },
        {
          athleteId: blue.id,
          matchId: match.id,
          roundNumber: 1,
          type: 'REFEREE_POINT',
          value: 2,
        },
        {
          athleteId: red.id,
          matchId: match.id,
          penaltyId: penalty.id,
          roundNumber: 1,
          type: 'PENALTY',
          value: -1,
        },
      ],
    });

    const cancelled = await cancelResults(socket, RealtimeEvent.ROUND_CANCEL);
    if (!cancelled.ok)
      throw new Error('Round cancellation unexpectedly failed');
    const cancelledSnapshot = await requestSnapshot(socket);
    expect(cancelledSnapshot.match).toMatchObject({
      currentRound: null,
      status: 'WAITING',
    });
    expect(
      cancelledSnapshot.athletes.find(({ color }) => color === 'RED'),
    ).toMatchObject({ score: 0, violations: 0 });
    expect(
      cancelledSnapshot.athletes.find(({ color }) => color === 'BLUE'),
    ).toMatchObject({ score: 0, violations: 0 });

    await expect(
      undoResultCancellation(socket, cancelled.action.actionId),
    ).resolves.toMatchObject({
      ok: true,
      undo: { operationId: cancelled.action.actionId, status: 'BREAK' },
    });
    const restoredSnapshot = await requestSnapshot(socket);
    expect(restoredSnapshot.match).toMatchObject({
      currentRound: 1,
      status: 'BREAK',
    });
    expect(
      restoredSnapshot.athletes.find(({ color }) => color === 'RED'),
    ).toMatchObject({ score: 2, violations: 1 });
    expect(
      restoredSnapshot.athletes.find(({ color }) => color === 'BLUE'),
    ).toMatchObject({ score: 2, violations: 0 });
    await expect(
      prisma.matchResultOperation.findUniqueOrThrow({
        where: { id: cancelled.action.actionId },
      }),
    ).resolves.toMatchObject({ status: 'UNDONE', undoneAt: expect.any(Date) });
  });

  it('serializes duplicate cancellation and undo commands from the same inspector session', async () => {
    const match = await createMatch('duplicate-cancel-undo');
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'duplicate-cancel-undo-inspector',
    );
    const [firstSocket, secondSocket] = await Promise.all([
      connect(inspector.cookie),
      connect(inspector.cookie),
    ]);
    const now = new Date();
    await prisma.match.update({
      data: { currentRound: 1, startedAt: now, status: MatchStatus.BREAK },
      where: { id: match.id },
    });
    await prisma.round.create({
      data: {
        endedAt: now,
        endsAt: now,
        matchId: match.id,
        roundNumber: 1,
        startedAt: new Date(now.getTime() - 1_000),
      },
    });

    const cancellations = await Promise.all([
      cancelResults(firstSocket, RealtimeEvent.ROUND_CANCEL),
      cancelResults(secondSocket, RealtimeEvent.ROUND_CANCEL),
    ]);
    const appliedCancellation = cancellations.find((response) => response.ok);
    expect(cancellations.filter((response) => response.ok)).toHaveLength(1);
    if (appliedCancellation === undefined || !appliedCancellation.ok) {
      throw new Error('One cancellation should have been applied');
    }
    await expect(
      prisma.matchResultOperation.count({ where: { matchId: match.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { eventType: 'ROUND_RESULT_CANCELLED', matchId: match.id },
      }),
    ).resolves.toBe(1);

    const undos = await Promise.all([
      undoResultCancellation(firstSocket, appliedCancellation.action.actionId),
      undoResultCancellation(secondSocket, appliedCancellation.action.actionId),
    ]);
    expect(undos.filter((response) => response.ok)).toHaveLength(1);
    await expect(
      prisma.auditLog.count({
        where: { eventType: 'ROUND_RESULT_CANCEL_UNDONE', matchId: match.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.matchResultOperation.findUniqueOrThrow({
        where: { id: appliedCancellation.action.actionId },
      }),
    ).resolves.toMatchObject({ status: 'UNDONE' });
  });

  it('cancels only Round 2 effects and keeps effective Round 1 scoring', async () => {
    const match = await createMatch('cancel-round-two');
    const inspector = await login(
      match,
      MatchAccessRole.INSPECTOR,
      'cancel-r2-inspector',
    );
    const socket = await connect(inspector.cookie);
    const red = await prisma.matchAthlete.findFirstOrThrow({
      where: { color: AthleteColor.RED, matchId: match.id },
    });
    const now = new Date();
    await prisma.match.update({
      data: {
        currentRound: 2,
        finishedAt: now,
        startedAt: now,
        status: MatchStatus.FINISHED,
      },
      where: { id: match.id },
    });
    await prisma.round.createMany({
      data: [1, 2].map((roundNumber) => ({
        endedAt: now,
        endsAt: now,
        matchId: match.id,
        roundNumber,
        startedAt: now,
      })),
    });
    await prisma.scoreEvent.createMany({
      data: [
        {
          athleteId: red.id,
          matchId: match.id,
          roundNumber: 1,
          type: 'REFEREE_POINT',
          value: 5,
        },
        {
          athleteId: red.id,
          matchId: match.id,
          roundNumber: 2,
          type: 'REFEREE_POINT',
          value: 3,
        },
      ],
    });

    await expect(
      cancelResults(socket, RealtimeEvent.ROUND_CANCEL),
    ).resolves.toMatchObject({
      action: { roundNumbers: [2], status: 'BREAK' },
      ok: true,
    });
    const snapshot = await requestSnapshot(socket);
    expect(snapshot.athletes.find(({ color }) => color === 'RED')?.score).toBe(
      5,
    );
    await expect(
      prisma.scoreEvent.count({
        where: { matchId: match.id, revertedAt: null },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.scoreEvent.count({
        where: { matchId: match.id, revertedAt: { not: null } },
      }),
    ).resolves.toBe(1);
  });
});
