import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  RefereeSlot,
  ScoreEventType,
} from '@prisma/client';
import {
  RealtimeEvent,
  type MatchPresenceEntry,
  type MatchStatePayload,
  type PublicMatchStatePayload,
  type PenaltyAddedPayload,
  type PenaltyAddResponse,
  type PresenceUpdatedPayload,
  type RoundStartResponse,
  type ScoreUpdatedPayload,
  type SessionRevokedPayload,
  type VoteSubmitResponse,
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
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/12';
const SOCKET_PATH = '/api/socket.io';
const EVENT_TIMEOUT_MS = 7_500;
const TEST_RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const TEST_PREFIX = `realtime-e2e-${TEST_RUN_ID}`;
const ACCESS_ROLES = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const;

interface TestMatch {
  athleteIds: Record<AthleteColor, string>;
  id: string;
  publicId: string;
  rawCodes: Record<MatchAccessRole, string>;
}

interface LoginResponseBody {
  session: {
    sessionId: string;
  };
}

interface ActiveSessionConflictBody {
  canTakeOver: true;
  code: 'SESSION_ALREADY_ACTIVE';
  takeoverToken: string;
}

interface LoginResult {
  agent: ReturnType<typeof request.agent>;
  cookie: string;
  response: request.Response;
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
      'realtime-admin-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3004',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: TEST_DATABASE_URL,
    MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '100',
    MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: '1000',
    MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: '60',
    MATCH_PUBLIC_ID_INITIAL_LENGTH: '6',
    MATCH_SESSION_SECRET:
      'realtime-match-session-secret-with-at-least-thirty-two-characters',
    MATCH_SESSION_TTL_SECONDS: '3600',
    MATCH_TAKEOVER_TTL_SECONDS: '60',
    NODE_ENV: 'test',
    REDIS_URL: TEST_REDIS_URL,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

function cookieFrom(response: request.Response): string {
  const setCookie = response.headers['set-cookie'];
  const serializedCookie = Array.isArray(setCookie)
    ? String(setCookie[0])
    : String(setCookie ?? '');
  const cookie = serializedCookie.split(';')[0] ?? '';

  if (!cookie.includes('=')) {
    throw new Error('Match login did not return a session cookie');
  }

  return cookie;
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

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
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

function waitForDisconnect(socket: Socket): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('disconnect', onDisconnect);
      reject(new Error('Timed out waiting for Socket.IO disconnection'));
    }, EVENT_TIMEOUT_MS);
    const onDisconnect = (reason: string): void => {
      clearTimeout(timer);
      socket.off('disconnect', onDisconnect);
      resolve(reason);
    };

    socket.once('disconnect', onDisconnect);
  });
}

function presenceFor(
  payload: Pick<PresenceUpdatedPayload, 'presence'>,
  role: MatchAccessRole,
): MatchPresenceEntry {
  const entry = payload.presence.find(
    (candidate) => candidate.accessRole === role,
  );

  if (entry === undefined) {
    throw new Error(`Presence payload is missing ${role}`);
  }

  return entry;
}

describe('Realtime match infrastructure (integration)', () => {
  jest.setTimeout(90_000);

  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let tournamentId: string;
  let primaryMatch: TestMatch;
  let secondaryMatch: TestMatch;
  const createdMatchIds = new Set<string>();
  const sockets = new Set<Socket>();

  async function createTestMatch(label: string): Promise<TestMatch> {
    const rawCodes = Object.fromEntries(
      ACCESS_ROLES.map((role) => [
        role,
        `${label}-${role}-${randomBytes(10).toString('base64url')}`,
      ]),
    ) as Record<MatchAccessRole, string>;
    const accessCodes = await Promise.all(
      ACCESS_ROLES.map(async (role) => ({
        codeHash: await hash(rawCodes[role], 10),
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
              organization: `${label} Red Club`,
            },
            {
              color: AthleteColor.BLUE,
              name: `${TEST_PREFIX}-${label}-blue`,
              organization: `${label} Blue Club`,
            },
          ],
        },
        breakDurationMs: 60_000,
        publicId: randomBytes(6).toString('hex').slice(0, 8).toUpperCase(),
        roundDurationMs: 120_000,
        tournamentId,
      },
      include: { athletes: true },
    });
    const athleteIds = Object.fromEntries(
      match.athletes.map((athlete) => [athlete.color, athlete.id]),
    ) as Record<AthleteColor, string>;
    createdMatchIds.add(match.id);

    return {
      athleteIds,
      id: match.id,
      publicId: match.publicId,
      rawCodes,
    };
  }

  async function login(
    match: TestMatch,
    role: MatchAccessRole,
    deviceId: string,
  ): Promise<LoginResult> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.post('/api/match-access/login').send({
      deviceId,
      matchId: match.publicId,
      securityCode: match.rawCodes[role],
    });

    expect(response.status).toBe(200);

    return { agent, cookie: cookieFrom(response), response };
  }

  function socketClient(
    cookie?: string,
    reconnect = false,
    origin?: string,
  ): Socket {
    const socket = io(baseUrl, {
      autoConnect: false,
      extraHeaders:
        cookie === undefined && origin === undefined
          ? undefined
          : {
              ...(cookie === undefined ? {} : { Cookie: cookie }),
              ...(origin === undefined ? {} : { Origin: origin }),
            },
      forceNew: true,
      path: SOCKET_PATH,
      reconnection: reconnect,
      reconnectionAttempts: 3,
      reconnectionDelay: 25,
      timeout: 2_500,
      transports: ['websocket'],
    });
    sockets.add(socket);

    return socket;
  }

  async function connect(cookie: string, reconnect = false): Promise<Socket> {
    const socket = socketClient(cookie, reconnect);
    const connected = waitForConnect(socket);
    socket.connect();
    await connected;

    return socket;
  }

  async function connectScoreboard(publicMatchId: string): Promise<Socket> {
    const socket = scoreboardSocket(publicMatchId);
    const connected = waitForConnect(socket);
    socket.connect();
    await connected;
    return socket;
  }

  async function waitForReadySnapshot(
    socket: Socket,
  ): Promise<MatchStatePayload> {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const snapshot = await requestSnapshot(socket);
      const connectedRoles = new Set<string>(
        snapshot.presence
          .filter((entry) => entry.connected)
          .map((entry) => entry.accessRole),
      );
      if (
        connectedRoles.has(MatchAccessRole.REFEREE_1) &&
        connectedRoles.has(MatchAccessRole.REFEREE_2) &&
        connectedRoles.has(MatchAccessRole.REFEREE_3) &&
        snapshot.scoreboardConnectedCount >= 1
      ) {
        return snapshot;
      }
    }
    throw new Error('Timed out waiting for match start readiness');
  }

  async function waitForRefereesSnapshot(
    socket: Socket,
  ): Promise<MatchStatePayload> {
    const deadline = Date.now() + EVENT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const snapshot = await requestSnapshot(socket);
      const connectedRoles = new Set<string>(
        snapshot.presence
          .filter((entry) => entry.connected)
          .map((entry) => entry.accessRole),
      );
      if (
        connectedRoles.has(MatchAccessRole.REFEREE_1) &&
        connectedRoles.has(MatchAccessRole.REFEREE_2) &&
        connectedRoles.has(MatchAccessRole.REFEREE_3)
      ) {
        return snapshot;
      }
    }
    throw new Error('Timed out waiting for referee readiness');
  }

  function scoreboardSocket(publicMatchId: string): Socket {
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
    return socket;
  }

  async function requestSnapshot(
    socket: Socket,
    maliciousPayload?: Record<string, unknown>,
  ): Promise<MatchStatePayload> {
    const snapshot = waitForEvent<MatchStatePayload>(
      socket,
      RealtimeEvent.MATCH_STATE,
    );

    if (maliciousPayload === undefined) {
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    } else {
      socket.emit(RealtimeEvent.MATCH_STATE_REQUEST, maliciousPayload);
    }

    return snapshot;
  }

  function startRound(socket: Socket): Promise<RoundStartResponse> {
    return new Promise((resolve) => {
      socket.emit(RealtimeEvent.ROUND_START, resolve);
    });
  }

  function submitVote(
    socket: Socket,
    athlete: AthleteColor,
  ): Promise<VoteSubmitResponse> {
    return new Promise((resolve) => {
      socket.emit(RealtimeEvent.VOTE_SUBMIT, { athlete }, resolve);
    });
  }

  function submitPenalty(
    socket: Socket,
    athlete: AthleteColor,
  ): Promise<PenaltyAddResponse> {
    return new Promise((resolve) => {
      socket.emit(RealtimeEvent.PENALTY_ADD, { athlete }, resolve);
    });
  }

  beforeAll(async () => {
    configureTestEnvironment();

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
    redis = new Redis(TEST_REDIS_URL, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    await redis.flushdb();

    await prisma.user.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'realtime-fixture-owner',
        normalizedUsername: 'realtime-fixture-owner',
        passwordHash: 'not-a-real-login-hash',
      },
    });

    const tournament = await prisma.tournament.create({
      data: {
        name: `${TEST_PREFIX}-tournament`,
        ownerUserId: '00000000-0000-4000-8000-000000000001',
      },
      select: { id: true },
    });
    tournamentId = tournament.id;
    primaryMatch = await createTestMatch('primary');
    secondaryMatch = await createTestMatch('secondary');

    await prisma.scoreEvent.createMany({
      data: [
        {
          athleteId: primaryMatch.athleteIds[AthleteColor.RED],
          matchId: primaryMatch.id,
          type: ScoreEventType.ADMIN_ADJUSTMENT,
          value: 2,
        },
        {
          athleteId: primaryMatch.athleteIds[AthleteColor.BLUE],
          matchId: primaryMatch.id,
          type: ScoreEventType.ADMIN_ADJUSTMENT,
          value: -1,
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.penalty.deleteMany({
      where: { matchId: { in: [...createdMatchIds] } },
    });
    await prisma.scoreEvent.deleteMany({
      where: {
        matchId: { in: [...createdMatchIds] },
        type: {
          in: [ScoreEventType.PENALTY, ScoreEventType.REFEREE_POINT],
        },
      },
    });
    await prisma.refereeVote.deleteMany({
      where: { matchId: { in: [...createdMatchIds] } },
    });
    await prisma.scoringWindow.deleteMany({
      where: { matchId: { in: [...createdMatchIds] } },
    });
    await prisma.round.deleteMany({
      where: { matchId: { in: [...createdMatchIds] } },
    });
    await prisma.matchSession.deleteMany({
      where: { matchId: { in: [...createdMatchIds] } },
    });
    await prisma.match.updateMany({
      data: {
        currentRound: null,
        finishedAt: null,
        startedAt: null,
        status: 'WAITING',
      },
      where: { id: { in: [...createdMatchIds] } },
    });
    await redis.flushdb();
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    sockets.clear();
  });

  afterAll(async () => {
    if (prisma !== undefined && primaryMatch !== undefined) {
      await prisma.auditLog.deleteMany({
        where: {
          matchId: { in: [...createdMatchIds] },
        },
      });
      await prisma.match.deleteMany({
        where: { id: { in: [...createdMatchIds] } },
      });
    }
    if (prisma !== undefined && tournamentId !== undefined) {
      await prisma.tournament.deleteMany({ where: { id: tournamentId } });
    }
    if (redis !== undefined) {
      await redis.flushdb();
      await redis.quit();
    }
    if (app !== undefined) {
      await app.close();
    }
  });

  it('rejects an unauthenticated socket during the handshake', async () => {
    const socket = socketClient();
    const connectError = new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Unauthenticated socket was not rejected')),
        EVENT_TIMEOUT_MS,
      );

      socket.once('connect', () => {
        clearTimeout(timer);
        reject(new Error('Unauthenticated socket unexpectedly connected'));
      });
      socket.once('connect_error', (error: Error) => {
        clearTimeout(timer);
        resolve(error);
      });
    });

    socket.connect();
    const error = (await connectError) as SocketAuthenticationError;

    expect(error.message).toBeTruthy();
    expect(error.data).toMatchObject({
      code: 'REALTIME_AUTHENTICATION_REQUIRED',
    });
    expect(socket.connected).toBe(false);
  });

  it('allows a read-only public scoreboard and never exposes participant data', async () => {
    const socket = scoreboardSocket(primaryMatch.publicId);
    const snapshot = waitForEvent<PublicMatchStatePayload>(
      socket,
      RealtimeEvent.PUBLIC_MATCH_STATE,
    );
    const connected = waitForConnect(socket);
    socket.connect();
    await connected;

    const state = await snapshot;
    expect(state).toMatchObject({
      match: { publicId: primaryMatch.publicId, status: 'WAITING' },
    });
    expect(state).not.toHaveProperty('presence');
    expect(state.match).not.toHaveProperty('id');
    expect(state.athletes[0]).not.toHaveProperty('id');
    await expect(startRound(socket)).resolves.toMatchObject({
      error: { code: 'REALTIME_AUTHENTICATION_REQUIRED' },
      ok: false,
    });

    const inspector = await login(
      primaryMatch,
      MatchAccessRole.INSPECTOR,
      `${TEST_PREFIX}-public-scoreboard-inspector`,
    );
    const inspectorSocket = await connect(inspector.cookie);
    const refereeLogins = await Promise.all(
      [
        MatchAccessRole.REFEREE_1,
        MatchAccessRole.REFEREE_2,
        MatchAccessRole.REFEREE_3,
      ].map((role) =>
        login(primaryMatch, role, `${TEST_PREFIX}-public-scoreboard-${role}`),
      ),
    );
    await Promise.all(refereeLogins.map(({ cookie }) => connect(cookie)));
    await waitForReadySnapshot(inspectorSocket);
    const roundStarted = waitForEvent<PublicMatchStatePayload>(
      socket,
      RealtimeEvent.PUBLIC_MATCH_STATE,
      (payload) => payload.match.status === 'ROUND_1_RUNNING',
    );
    await expect(startRound(inspectorSocket)).resolves.toMatchObject({
      ok: true,
    });
    await expect(roundStarted).resolves.toMatchObject({
      match: { publicId: primaryMatch.publicId, status: 'ROUND_1_RUNNING' },
    });

    const penaltyRecorded = waitForEvent<PublicMatchStatePayload>(
      socket,
      RealtimeEvent.PUBLIC_MATCH_STATE,
      (payload) =>
        payload.athletes.some(
          (athlete) =>
            athlete.color === 'RED' &&
            athlete.score === 1 &&
            athlete.violations === 1,
        ),
    );
    await expect(
      submitPenalty(inspectorSocket, AthleteColor.RED),
    ).resolves.toMatchObject({
      ok: true,
    });
    await expect(penaltyRecorded).resolves.toBeDefined();
  });

  it('rejects starts unless referees and scoreboards are present on the same match', async () => {
    const match = await createTestMatch('readiness-scope');
    const [inspector, refereeOne, refereeTwo, refereeThree] = await Promise.all(
      [
        login(
          match,
          MatchAccessRole.INSPECTOR,
          `${TEST_PREFIX}-readiness-inspector`,
        ),
        login(match, MatchAccessRole.REFEREE_1, `${TEST_PREFIX}-readiness-r1`),
        login(match, MatchAccessRole.REFEREE_2, `${TEST_PREFIX}-readiness-r2`),
        login(match, MatchAccessRole.REFEREE_3, `${TEST_PREFIX}-readiness-r3`),
      ],
    );
    const [inspectorSocket, , refereeTwoSocket] = await Promise.all([
      connect(inspector.cookie),
      connect(refereeOne.cookie),
      connect(refereeTwo.cookie),
      connect(refereeThree.cookie),
      connectScoreboard(secondaryMatch.publicId),
    ]);
    await waitForRefereesSnapshot(inspectorSocket);

    await expect(startRound(inspectorSocket)).resolves.toEqual({
      error: {
        code: 'MATCH_PARTICIPANTS_NOT_READY',
        details: {
          referee1Connected: true,
          referee2Connected: true,
          referee3Connected: true,
          scoreboardConnectedCount: 0,
        },
        message:
          'All three referees and at least one scoreboard must be connected before the round can start.',
      },
      ok: false,
    });
    await expect(
      prisma.round.count({ where: { matchId: match.id } }),
    ).resolves.toBe(0);

    const firstScoreboard = await connectScoreboard(match.publicId);
    await connectScoreboard(match.publicId);
    const readySnapshot = await waitForReadySnapshot(inspectorSocket);
    expect(readySnapshot.scoreboardConnectedCount).toBe(2);

    const secondaryRefereeTwo = await login(
      secondaryMatch,
      MatchAccessRole.REFEREE_2,
      `${TEST_PREFIX}-secondary-readiness-r2`,
    );
    await connect(secondaryRefereeTwo.cookie);
    const primaryParticipantMissing = waitForEvent<PresenceUpdatedPayload>(
      inspectorSocket,
      RealtimeEvent.PRESENCE_UPDATED,
      (payload) =>
        payload.scoreboardConnectedCount === 1 &&
        !presenceFor(payload, MatchAccessRole.REFEREE_2).connected,
    );
    firstScoreboard.disconnect();
    refereeTwoSocket.disconnect();
    await expect(primaryParticipantMissing).resolves.toMatchObject({
      matchPublicId: match.publicId,
      scoreboardConnectedCount: 1,
    });
    await expect(startRound(inspectorSocket)).resolves.toMatchObject({
      error: {
        code: 'MATCH_PARTICIPANTS_NOT_READY',
        details: {
          referee1Connected: true,
          referee2Connected: false,
          referee3Connected: true,
          scoreboardConnectedCount: 1,
        },
      },
      ok: false,
    });

    await connect(refereeTwo.cookie);
    await waitForReadySnapshot(inspectorSocket);
    await expect(startRound(inspectorSocket)).resolves.toMatchObject({
      ok: true,
    });
  });

  it('rejects an authenticated WebSocket from an unexpected browser origin', async () => {
    const owner = await login(
      primaryMatch,
      MatchAccessRole.REFEREE_1,
      `${TEST_PREFIX}-hostile-origin-r1`,
    );
    const socket = socketClient(
      owner.cookie,
      false,
      'http://hostile.localhost:5173',
    );
    const connectError = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Unexpected browser origin was not rejected')),
        EVENT_TIMEOUT_MS,
      );

      socket.once('connect', () => {
        clearTimeout(timer);
        reject(new Error('Unexpected browser origin was allowed to connect'));
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    socket.connect();
    await connectError;
    expect(socket.connected).toBe(false);
  });

  it('authenticates a match socket and returns a fresh database-backed snapshot', async () => {
    const owner = await login(
      primaryMatch,
      MatchAccessRole.REFEREE_1,
      `${TEST_PREFIX}-authenticated-r1`,
    );
    const socket = await connect(owner.cookie);
    const state = await requestSnapshot(socket);

    expect(state.match).toMatchObject({
      currentRound: null,
      id: primaryMatch.id,
      publicId: primaryMatch.publicId,
      status: 'WAITING',
    });
    expect(state.generatedAt).toEqual(expect.any(String));
    expect(state.athletes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: AthleteColor.RED,
          id: primaryMatch.athleteIds[AthleteColor.RED],
          score: 2,
        }),
        expect.objectContaining({
          color: AthleteColor.BLUE,
          id: primaryMatch.athleteIds[AthleteColor.BLUE],
          score: -1,
        }),
      ]),
    );
    expect(presenceFor(state, MatchAccessRole.REFEREE_1)).toMatchObject({
      activeSession: true,
      connected: true,
      connectedSocketCount: 1,
    });
  });

  it('derives the room from the session and ignores cross-match payload claims', async () => {
    const [primaryOwner, secondaryOwner] = await Promise.all([
      login(
        primaryMatch,
        MatchAccessRole.REFEREE_1,
        `${TEST_PREFIX}-primary-room-r1`,
      ),
      login(
        secondaryMatch,
        MatchAccessRole.REFEREE_1,
        `${TEST_PREFIX}-secondary-room-r1`,
      ),
    ]);
    const [primarySocket, secondarySocket] = await Promise.all([
      connect(primaryOwner.cookie),
      connect(secondaryOwner.cookie),
    ]);
    const maliciousState = await requestSnapshot(primarySocket, {
      matchId: secondaryMatch.id,
      matchPublicId: secondaryMatch.publicId,
      room: `match:${secondaryMatch.publicId}`,
    });
    const secondaryState = await requestSnapshot(secondarySocket);

    expect(maliciousState.match.id).toBe(primaryMatch.id);
    expect(maliciousState.match.publicId).toBe(primaryMatch.publicId);
    expect(secondaryState.match.id).toBe(secondaryMatch.id);

    let crossMatchPresenceReceived = false;
    const crossMatchListener = (payload: PresenceUpdatedPayload): void => {
      if (payload.matchPublicId === primaryMatch.publicId) {
        crossMatchPresenceReceived = true;
      }
    };
    secondarySocket.on(RealtimeEvent.PRESENCE_UPDATED, crossMatchListener);

    const secondPrimaryOwner = await login(
      primaryMatch,
      MatchAccessRole.REFEREE_2,
      `${TEST_PREFIX}-primary-room-r2`,
    );
    await connect(secondPrimaryOwner.cookie);
    await new Promise<void>((resolve) => setTimeout(resolve, 250));

    secondarySocket.off(RealtimeEvent.PRESENCE_UPDATED, crossMatchListener);
    expect(crossMatchPresenceReceived).toBe(false);
  });

  it('broadcasts role presence and keeps the active session after a socket disconnects', async () => {
    const logins = new Map<MatchAccessRole, LoginResult>();

    for (const role of ACCESS_ROLES) {
      logins.set(
        role,
        await login(
          primaryMatch,
          role,
          `${TEST_PREFIX}-presence-${role.toLowerCase()}`,
        ),
      );
    }

    const refereeOne = await connect(
      logins.get(MatchAccessRole.REFEREE_1)?.cookie ?? '',
    );
    const allConnectedUpdate = waitForEvent<PresenceUpdatedPayload>(
      refereeOne,
      RealtimeEvent.PRESENCE_UPDATED,
      (payload) =>
        ACCESS_ROLES.every(
          (role) => presenceFor(payload, role).connectedSocketCount === 1,
        ),
    );
    await connect(logins.get(MatchAccessRole.REFEREE_2)?.cookie ?? '');
    await connect(logins.get(MatchAccessRole.REFEREE_3)?.cookie ?? '');
    const inspector = await connect(
      logins.get(MatchAccessRole.INSPECTOR)?.cookie ?? '',
    );
    const connectedPresence = await allConnectedUpdate;

    expect(connectedPresence.matchPublicId).toBe(primaryMatch.publicId);
    for (const role of ACCESS_ROLES) {
      expect(presenceFor(connectedPresence, role)).toMatchObject({
        accessRole: role,
        activeSession: true,
        connected: true,
        connectedSocketCount: 1,
      });
    }

    const disconnectedUpdate = waitForEvent<PresenceUpdatedPayload>(
      refereeOne,
      RealtimeEvent.PRESENCE_UPDATED,
      (payload) => !presenceFor(payload, MatchAccessRole.INSPECTOR).connected,
    );
    inspector.disconnect();
    const disconnectedPresence = await disconnectedUpdate;

    expect(
      presenceFor(disconnectedPresence, MatchAccessRole.INSPECTOR),
    ).toMatchObject({
      activeSession: true,
      connected: false,
      connectedSocketCount: 0,
    });

    const persistedInspector = await prisma.matchSession.findFirstOrThrow({
      where: {
        active: true,
        matchId: primaryMatch.id,
        role: MatchRole.INSPECTOR,
      },
    });
    expect(persistedInspector.revokedAt).toBeNull();
  });

  it('reauthenticates, rejoins, and can request a fresh snapshot after reconnect', async () => {
    const owner = await login(
      primaryMatch,
      MatchAccessRole.REFEREE_2,
      `${TEST_PREFIX}-reconnect-r2`,
    );
    const socket = await connect(owner.cookie, true);
    const firstSocketId = socket.id;
    const reconnected = waitForConnect(socket);

    socket.io.engine.close();
    await reconnected;

    expect(socket.connected).toBe(true);
    expect(socket.id).toEqual(expect.any(String));
    expect(socket.id).not.toBe(firstSocketId);

    const state = await requestSnapshot(socket);
    expect(state.match.publicId).toBe(primaryMatch.publicId);
    expect(presenceFor(state, MatchAccessRole.REFEREE_2)).toMatchObject({
      activeSession: true,
      connected: true,
      connectedSocketCount: 1,
    });
  });

  it('revalidates the persisted owner before every sensitive socket command', async () => {
    const owner = await login(
      primaryMatch,
      MatchAccessRole.REFEREE_1,
      `${TEST_PREFIX}-command-revalidation-r1`,
    );
    const sessionId = (owner.response.body as LoginResponseBody).session
      .sessionId;
    const socket = await connect(owner.cookie);

    await prisma.matchSession.update({
      data: { active: false, revokedAt: new Date() },
      where: { id: sessionId },
    });

    let stateReceived = false;
    const stateListener = (): void => {
      stateReceived = true;
    };
    socket.on(RealtimeEvent.MATCH_STATE, stateListener);
    const revokedEvent = waitForEvent<SessionRevokedPayload>(
      socket,
      RealtimeEvent.SESSION_REVOKED,
    );
    const disconnected = waitForDisconnect(socket);

    socket.emit(RealtimeEvent.MATCH_STATE_REQUEST, {
      matchPublicId: primaryMatch.publicId,
    });

    await expect(revokedEvent).resolves.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    await expect(disconnected).resolves.toBeTruthy();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    socket.off(RealtimeEvent.MATCH_STATE, stateListener);

    expect(stateReceived).toBe(false);
    expect(socket.connected).toBe(false);
  });

  it('revokes and disconnects the old socket on takeover and denies its old credential', async () => {
    const role = MatchAccessRole.REFEREE_3;
    const owner = await login(
      primaryMatch,
      role,
      `${TEST_PREFIX}-takeover-owner`,
    );
    const ownerSessionId = (owner.response.body as LoginResponseBody).session
      .sessionId;
    const oldSocket = await connect(owner.cookie);
    const contenderAgent = request.agent(app.getHttpServer());
    const conflictResponse = await contenderAgent
      .post('/api/match-access/login')
      .send({
        deviceId: `${TEST_PREFIX}-takeover-contender`,
        matchId: primaryMatch.publicId,
        securityCode: primaryMatch.rawCodes[role],
      })
      .expect(409);
    const conflict = conflictResponse.body as ActiveSessionConflictBody;
    expect(conflict).toMatchObject({
      canTakeOver: true,
      code: 'SESSION_ALREADY_ACTIVE',
      takeoverToken: expect.any(String),
    });

    const revokedEvent = waitForEvent<SessionRevokedPayload>(
      oldSocket,
      RealtimeEvent.SESSION_REVOKED,
    );
    const disconnected = waitForDisconnect(oldSocket);
    const takeoverResponse = await contenderAgent
      .post('/api/match-access/takeover')
      .send({
        deviceId: `${TEST_PREFIX}-takeover-contender`,
        matchId: primaryMatch.publicId,
        securityCode: primaryMatch.rawCodes[role],
        takeoverToken: conflict.takeoverToken,
      })
      .expect(200);

    await expect(revokedEvent).resolves.toMatchObject({
      code: 'SESSION_REVOKED',
      message: expect.any(String),
    });
    await expect(disconnected).resolves.toBeTruthy();
    expect(oldSocket.connected).toBe(false);

    const oldSession = await prisma.matchSession.findUniqueOrThrow({
      where: { id: ownerSessionId },
    });
    expect(oldSession).toMatchObject({ active: false });
    expect(oldSession.revokedAt).toBeInstanceOf(Date);

    const rejectedOldSocket = socketClient(owner.cookie);
    const oldCredentialRejected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Revoked socket did not receive a result')),
        EVENT_TIMEOUT_MS,
      );

      rejectedOldSocket.once('connect', () => {
        clearTimeout(timer);
        reject(new Error('Revoked match session unexpectedly reconnected'));
      });
      rejectedOldSocket.once('connect_error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    rejectedOldSocket.connect();
    await oldCredentialRejected;

    const newSocket = await connect(cookieFrom(takeoverResponse));
    const newState = await requestSnapshot(newSocket);
    expect(newState.match.publicId).toBe(primaryMatch.publicId);
    expect(presenceFor(newState, role)).toMatchObject({
      activeSession: true,
      connected: true,
      connectedSocketCount: 1,
    });
  });

  it('accepts referee-only vote:submit payloads and broadcasts one official majority point', async () => {
    const match = await createTestMatch('scoring-command');
    const [inspector, refereeOne, refereeTwo, refereeThree] = await Promise.all(
      [
        login(
          match,
          MatchAccessRole.INSPECTOR,
          `${TEST_PREFIX}-score-inspector`,
        ),
        login(match, MatchAccessRole.REFEREE_1, `${TEST_PREFIX}-score-r1`),
        login(match, MatchAccessRole.REFEREE_2, `${TEST_PREFIX}-score-r2`),
        login(match, MatchAccessRole.REFEREE_3, `${TEST_PREFIX}-score-r3`),
      ],
    );
    const [inspectorSocket, r1Socket, r2Socket, r3Socket] = await Promise.all([
      connect(inspector.cookie),
      connect(refereeOne.cookie),
      connect(refereeTwo.cookie),
      connect(refereeThree.cookie),
    ]);
    await connectScoreboard(match.publicId);
    await waitForReadySnapshot(inspectorSocket);
    await expect(startRound(inspectorSocket)).resolves.toMatchObject({
      ok: true,
    });
    await requestSnapshot(r1Socket);

    await expect(
      submitVote(inspectorSocket, AthleteColor.RED),
    ).resolves.toMatchObject({
      error: { code: 'VOTE_FORBIDDEN' },
      ok: false,
    });
    const scoreUpdated = waitForEvent<ScoreUpdatedPayload>(
      r3Socket,
      RealtimeEvent.SCORE_UPDATED,
      (payload) => payload.matchPublicId === match.publicId,
    );
    await expect(submitVote(r1Socket, AthleteColor.RED)).resolves.toMatchObject(
      { ok: true },
    );
    await expect(submitVote(r2Socket, AthleteColor.RED)).resolves.toMatchObject(
      { ok: true },
    );
    await expect(
      submitVote(r3Socket, AthleteColor.BLUE),
    ).resolves.toMatchObject({ ok: true });
    await expect(scoreUpdated).resolves.toMatchObject({
      scores: expect.arrayContaining([
        expect.objectContaining({ color: AthleteColor.RED, score: 1 }),
      ]),
    });
    await expect(
      prisma.scoreEvent.count({
        where: { matchId: match.id, type: ScoreEventType.REFEREE_POINT },
      }),
    ).resolves.toBe(1);
  });

  it('returns unresolved voting state and the accepted vote only to its direct referee snapshot', async () => {
    const match = await createTestMatch('viewer-scoring-state');
    const [inspector, refereeOne, refereeTwo, refereeThree] = await Promise.all(
      [
        login(
          match,
          MatchAccessRole.INSPECTOR,
          `${TEST_PREFIX}-viewer-inspector`,
        ),
        login(match, MatchAccessRole.REFEREE_1, `${TEST_PREFIX}-viewer-r1`),
        login(match, MatchAccessRole.REFEREE_2, `${TEST_PREFIX}-viewer-r2`),
        login(match, MatchAccessRole.REFEREE_3, `${TEST_PREFIX}-viewer-r3`),
      ],
    );
    const [inspectorSocket, refereeOneSocket, refereeTwoSocket] =
      await Promise.all([
        connect(inspector.cookie),
        connect(refereeOne.cookie),
        connect(refereeTwo.cookie),
        connect(refereeThree.cookie),
      ]);
    await connectScoreboard(match.publicId);
    await waitForReadySnapshot(inspectorSocket);

    const roomBroadcast = waitForEvent<MatchStatePayload>(
      refereeOneSocket,
      RealtimeEvent.MATCH_STATE,
      (payload) => payload.match.publicId === match.publicId,
    );
    await expect(startRound(inspectorSocket)).resolves.toMatchObject({
      ok: true,
    });
    const broadcastState = await roomBroadcast;
    expect(broadcastState.activeScoringWindow).toBeNull();
    expect(Object.hasOwn(broadcastState, 'viewer')).toBe(false);

    // Use a persisted long-lived unresolved window here rather than the
    // production one-second timer. This makes the reconnect-state assertion
    // deterministic without changing any scoring behavior.
    const window = await prisma.scoringWindow.create({
      data: {
        endsAt: new Date(Date.now() + 60_000),
        matchId: match.id,
        roundNumber: 1,
        startedAt: new Date(),
      },
    });
    const refereeOneSessionId = (refereeOne.response.body as LoginResponseBody)
      .session.sessionId;
    await prisma.refereeVote.create({
      data: {
        athleteColor: AthleteColor.RED,
        matchId: match.id,
        refereeSlot: RefereeSlot.REFEREE_1,
        scoringWindowId: window.id,
        serverReceivedAt: new Date(),
        sessionId: refereeOneSessionId,
      },
    });

    const refereeOneState = await requestSnapshot(refereeOneSocket);
    const refereeTwoState = await requestSnapshot(refereeTwoSocket);
    expect(refereeOneState.activeScoringWindow).toMatchObject({
      id: window.id,
      roundNumber: 1,
    });
    expect(refereeOneState.viewer).toEqual({
      acceptedVote: expect.objectContaining({
        athlete: AthleteColor.RED,
        refereeSlot: RefereeSlot.REFEREE_1,
        scoringWindowId: window.id,
      }),
    });
    expect(refereeTwoState.activeScoringWindow).toMatchObject({
      id: window.id,
    });
    expect(refereeTwoState.viewer).toEqual({ acceptedVote: null });
  });

  it('accepts inspector-only penalty:add and broadcasts the durable penalty score', async () => {
    const match = await createTestMatch('penalty-command');
    const [inspector, referee, refereeTwo, refereeThree] = await Promise.all([
      login(
        match,
        MatchAccessRole.INSPECTOR,
        `${TEST_PREFIX}-penalty-inspector`,
      ),
      login(match, MatchAccessRole.REFEREE_1, `${TEST_PREFIX}-penalty-r1`),
      login(match, MatchAccessRole.REFEREE_2, `${TEST_PREFIX}-penalty-r2`),
      login(match, MatchAccessRole.REFEREE_3, `${TEST_PREFIX}-penalty-r3`),
    ]);
    const [inspectorSocket, refereeSocket] = await Promise.all([
      connect(inspector.cookie),
      connect(referee.cookie),
      connect(refereeTwo.cookie),
      connect(refereeThree.cookie),
    ]);
    await connectScoreboard(match.publicId);
    await waitForReadySnapshot(inspectorSocket);
    await expect(startRound(inspectorSocket)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      submitPenalty(refereeSocket, AthleteColor.RED),
    ).resolves.toMatchObject({
      error: { code: 'PENALTY_FORBIDDEN' },
      ok: false,
    });

    const penaltyAdded = waitForEvent<PenaltyAddedPayload>(
      refereeSocket,
      RealtimeEvent.PENALTY_ADDED,
      (payload) => payload.matchPublicId === match.publicId,
    );
    const scoreUpdated = waitForEvent<ScoreUpdatedPayload>(
      refereeSocket,
      RealtimeEvent.SCORE_UPDATED,
      (payload) => payload.matchPublicId === match.publicId,
    );
    await expect(
      submitPenalty(inspectorSocket, AthleteColor.RED),
    ).resolves.toMatchObject({
      ok: true,
      penalty: { athlete: AthleteColor.RED, value: -1, violationCount: 1 },
    });
    await expect(penaltyAdded).resolves.toMatchObject({
      penalty: { athlete: AthleteColor.RED, value: -1, violationCount: 1 },
    });
    await expect(scoreUpdated).resolves.toMatchObject({
      penaltyId: expect.any(String),
      scoringWindowId: null,
      scores: expect.arrayContaining([
        expect.objectContaining({ color: AthleteColor.RED, score: -1 }),
      ]),
    });
    const snapshot = await requestSnapshot(refereeSocket);
    expect(snapshot.athletes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: AthleteColor.RED,
          score: -1,
          violations: 1,
        }),
      ]),
    );
    await expect(
      prisma.penalty.count({ where: { matchId: match.id } }),
    ).resolves.toBe(1);
  });
});
