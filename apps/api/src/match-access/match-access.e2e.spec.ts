import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AthleteColor,
  MatchAccessRole,
  MatchRole,
  RefereeSlot,
} from '@prisma/client';
import { hash } from 'bcryptjs';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import request from 'supertest';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const TEST_REDIS_URL = 'redis://localhost:6379/13';
const TEST_RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const TEST_PREFIX = `match-access-e2e-${TEST_RUN_ID}`;

const rawAccessCodes = {
  [MatchAccessRole.INSPECTOR]: `INS-${randomBytes(12).toString('base64url')}`,
  [MatchAccessRole.REFEREE_1]: `R1-${randomBytes(12).toString('base64url')}`,
  [MatchAccessRole.REFEREE_2]: `R2-${randomBytes(12).toString('base64url')}`,
  [MatchAccessRole.REFEREE_3]: `R3-${randomBytes(12).toString('base64url')}`,
} as const satisfies Record<MatchAccessRole, string>;

const expectedIdentities = {
  [MatchAccessRole.INSPECTOR]: {
    refereeSlot: null,
    role: MatchRole.INSPECTOR,
  },
  [MatchAccessRole.REFEREE_1]: {
    refereeSlot: RefereeSlot.REFEREE_1,
    role: MatchRole.REFEREE,
  },
  [MatchAccessRole.REFEREE_2]: {
    refereeSlot: RefereeSlot.REFEREE_2,
    role: MatchRole.REFEREE,
  },
  [MatchAccessRole.REFEREE_3]: {
    refereeSlot: RefereeSlot.REFEREE_3,
    role: MatchRole.REFEREE,
  },
} as const satisfies Record<
  MatchAccessRole,
  { refereeSlot: RefereeSlot | null; role: MatchRole }
>;

interface MatchSessionIdentity {
  deviceId: string;
  expiresAt: string;
  matchPublicId: string;
  refereeSlot: RefereeSlot | null;
  role: MatchRole;
  sessionId: string;
}

interface MatchSessionResponseBody {
  session: MatchSessionIdentity;
}

interface ActiveSessionConflictBody {
  canTakeOver: true;
  code: 'SESSION_ALREADY_ACTIVE';
  takeoverToken: string;
}

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '10',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    ADMIN_SESSION_SECRET:
      'match-access-admin-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3003',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: TEST_DATABASE_URL,
    MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS: '5',
    MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS: '100',
    MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS: '60',
    MATCH_PUBLIC_ID_INITIAL_LENGTH: '6',
    MATCH_SESSION_SECRET:
      'match-access-e2e-session-secret-with-at-least-thirty-two-characters',
    MATCH_SESSION_TTL_SECONDS: '3600',
    MATCH_TAKEOVER_TTL_SECONDS: '60',
    NODE_ENV: 'test',
    REDIS_URL: TEST_REDIS_URL,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

function readCookie(responseHeaders: Record<string, unknown>): {
  pair: string;
  token: string;
} {
  const setCookie = responseHeaders['set-cookie'];
  const serializedCookie = Array.isArray(setCookie)
    ? String(setCookie[0])
    : String(setCookie ?? '');
  const pair = serializedCookie.split(';')[0] ?? '';
  const separatorIndex = pair.indexOf('=');

  if (separatorIndex < 1 || separatorIndex === pair.length - 1) {
    throw new Error('Match login did not return a session cookie');
  }

  return {
    pair,
    token: decodeURIComponent(pair.slice(separatorIndex + 1)),
  };
}

function expectNoRawSecurityCode(body: unknown, securityCode: string): void {
  expect(JSON.stringify(body)).not.toContain(securityCode);
}

describe('Match participant authentication (integration)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tournamentId: string;
  let matchId: string;
  let matchPublicId: string;

  async function login(
    role: MatchAccessRole,
    deviceId: string,
  ): Promise<{
    agent: ReturnType<typeof request.agent>;
    response: request.Response;
  }> {
    const agent = request.agent(app.getHttpServer());
    const response = await agent.post('/api/match-access/login').send({
      deviceId,
      matchId: matchPublicId,
      securityCode: rawAccessCodes[role],
    });

    return { agent, response };
  }

  async function requestTakeover(
    agent: ReturnType<typeof request.agent>,
    role: MatchAccessRole,
    deviceId: string,
    takeoverToken: string,
  ): Promise<request.Response> {
    return agent.post('/api/match-access/takeover').send({
      deviceId,
      matchId: matchPublicId,
      securityCode: rawAccessCodes[role],
      takeoverToken,
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
    await app.init();

    prisma = app.get(PrismaService);
    redis = new Redis(TEST_REDIS_URL, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    await redis.flushdb();

    const tournament = await prisma.tournament.create({
      data: { name: `${TEST_PREFIX}-tournament`, ownerUserId: '00000000-0000-4000-8000-000000000001' },
      select: { id: true },
    });
    tournamentId = tournament.id;
    matchPublicId = randomBytes(6).toString('hex').slice(0, 8).toUpperCase();

    const accessCodes = await Promise.all(
      Object.values(MatchAccessRole).map(async (role) => ({
        codeHash: await hash(rawAccessCodes[role], 10),
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
              name: `${TEST_PREFIX}-red`,
              organization: 'Red test organization',
            },
            {
              color: AthleteColor.BLUE,
              name: `${TEST_PREFIX}-blue`,
              organization: 'Blue test organization',
            },
          ],
        },
        breakDurationMs: 60_000,
        publicId: matchPublicId,
        roundDurationMs: 120_000,
        tournamentId,
      },
      select: { id: true },
    });
    matchId = match.id;
  });

  beforeEach(async () => {
    await prisma.matchSession.deleteMany({ where: { matchId } });
    await redis.flushdb();
  });

  afterAll(async () => {
    if (prisma !== undefined && matchId !== undefined) {
      await prisma.match.deleteMany({ where: { id: matchId } });
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

  it.each([
    MatchAccessRole.REFEREE_1,
    MatchAccessRole.REFEREE_2,
    MatchAccessRole.REFEREE_3,
    MatchAccessRole.INSPECTOR,
  ])(
    'derives the %s identity from the verified server-side code',
    async (role) => {
      const deviceId = `${TEST_PREFIX}-${role.toLowerCase()}-device`;
      const { response } = await login(role, deviceId);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        session: {
          deviceId,
          expiresAt: expect.any(String),
          matchPublicId,
          ...expectedIdentities[role],
          sessionId: expect.any(String),
        },
      });
      expectNoRawSecurityCode(response.body, rawAccessCodes[role]);

      const persisted = await prisma.matchSession.findUniqueOrThrow({
        where: {
          id: (response.body as MatchSessionResponseBody).session.sessionId,
        },
      });
      expect(persisted).toMatchObject({
        active: true,
        deviceId,
        matchId,
        ...expectedIdentities[role],
        revokedAt: null,
      });
    },
  );

  it('does not accept browser-supplied role or referee-slot claims', async () => {
    await request(app.getHttpServer())
      .post('/api/match-access/login')
      .send({
        deviceId: `${TEST_PREFIX}-untrusted-role-device`,
        matchId: matchPublicId,
        refereeSlot: RefereeSlot.REFEREE_1,
        role: MatchRole.REFEREE,
        securityCode: rawAccessCodes[MatchAccessRole.INSPECTOR],
      })
      .expect(400);

    expect(await prisma.matchSession.count({ where: { matchId } })).toBe(0);
  });

  it('returns the same invalid-credentials error for a bad code and unknown match ID', async () => {
    const invalidCodeResponse = await request(app.getHttpServer())
      .post('/api/match-access/login')
      .send({
        deviceId: `${TEST_PREFIX}-invalid-code-device`,
        matchId: matchPublicId,
        securityCode: 'definitely-not-a-real-security-code',
      })
      .expect(401);
    const unknownMatchResponse = await request(app.getHttpServer())
      .post('/api/match-access/login')
      .send({
        deviceId: `${TEST_PREFIX}-unknown-match-device`,
        matchId: 'ZZZZZZZZ',
        securityCode: rawAccessCodes[MatchAccessRole.REFEREE_1],
      })
      .expect(401);

    expect(unknownMatchResponse.body).toEqual(invalidCodeResponse.body);
    expect(invalidCodeResponse.body).toMatchObject({
      code: 'INVALID_MATCH_CREDENTIALS',
    });
    expectNoRawSecurityCode(
      invalidCodeResponse.body,
      'definitely-not-a-real-security-code',
    );
    expect(await prisma.matchSession.count({ where: { matchId } })).toBe(0);
  });

  it('requires takeover for every active owner and never trusts a cloned device ID', async () => {
    const role = MatchAccessRole.REFEREE_1;
    const ownerDeviceId = `${TEST_PREFIX}-active-owner`;
    const owner = await login(role, ownerDeviceId);
    expect(owner.response.status).toBe(200);

    const clonedDevice = await login(role, ownerDeviceId);
    expect(clonedDevice.response.status).toBe(409);
    expect(clonedDevice.response.body).toMatchObject({
      canTakeOver: true,
      code: 'SESSION_ALREADY_ACTIVE',
    });

    const contender = await login(role, `${TEST_PREFIX}-active-contender`);
    expect(contender.response.status).toBe(409);
    expect(contender.response.body).toMatchObject({
      canTakeOver: true,
      code: 'SESSION_ALREADY_ACTIVE',
      takeoverToken: expect.any(String),
    });
    expectNoRawSecurityCode(contender.response.body, rawAccessCodes[role]);

    const activeSessions = await prisma.matchSession.findMany({
      where: { accessCode: { role }, active: true, matchId },
    });
    expect(activeSessions).toHaveLength(1);
    expect(activeSessions[0]?.deviceId).toBe(ownerDeviceId);
  });

  it('rate limits repeated attempts for the same match credential', async () => {
    const role = MatchAccessRole.INSPECTOR;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await login(
        role,
        `${TEST_PREFIX}-rate-limit-device-${String(attempt)}`,
      );
      expect(result.response.status).toBe(attempt === 1 ? 200 : 409);
    }

    const limited = await login(role, `${TEST_PREFIX}-rate-limited-device`);
    expect(limited.response.status).toBe(429);
    expect(limited.response.body).toMatchObject({
      code: 'MATCH_ACCESS_RATE_LIMITED',
    });
    expectNoRawSecurityCode(limited.response.body, rawAccessCodes[role]);
  });

  it('atomically takes ownership and invalidates the old browser session', async () => {
    const role = MatchAccessRole.REFEREE_2;
    const owner = await login(role, `${TEST_PREFIX}-takeover-owner`);
    expect(owner.response.status).toBe(200);
    const ownerSession = (owner.response.body as MatchSessionResponseBody)
      .session;

    const contender = await login(role, `${TEST_PREFIX}-takeover-contender`);
    expect(contender.response.status).toBe(409);
    const conflict = contender.response.body as ActiveSessionConflictBody;
    expect(conflict.takeoverToken).toEqual(expect.any(String));

    const takeoverResponse = await requestTakeover(
      contender.agent,
      role,
      `${TEST_PREFIX}-takeover-contender`,
      conflict.takeoverToken,
    );
    expect(takeoverResponse.status).toBe(200);
    expect(takeoverResponse.body).toMatchObject({
      session: {
        deviceId: `${TEST_PREFIX}-takeover-contender`,
        matchPublicId,
        ...expectedIdentities[role],
      },
    });

    await owner.agent.get('/api/match-access/session').expect(401);
    await contender.agent
      .get('/api/match-access/session')
      .expect(200)
      .expect(takeoverResponse.body as MatchSessionResponseBody);

    const oldSession = await prisma.matchSession.findUniqueOrThrow({
      where: { id: ownerSession.sessionId },
    });
    expect(oldSession.active).toBe(false);
    expect(oldSession.revokedAt).toBeInstanceOf(Date);

    const activeSessions = await prisma.matchSession.findMany({
      where: { accessCode: { role }, active: true, matchId },
    });
    expect(activeSessions).toHaveLength(1);
    expect(activeSessions[0]?.deviceId).toBe(
      `${TEST_PREFIX}-takeover-contender`,
    );
  });

  it('allows exactly one winner when two devices take over simultaneously', async () => {
    const role = MatchAccessRole.REFEREE_3;
    const owner = await login(role, `${TEST_PREFIX}-race-owner`);
    expect(owner.response.status).toBe(200);

    const [firstContender, secondContender] = await Promise.all([
      login(role, `${TEST_PREFIX}-race-first`),
      login(role, `${TEST_PREFIX}-race-second`),
    ]);
    expect(firstContender.response.status).toBe(409);
    expect(secondContender.response.status).toBe(409);

    const firstConflict = firstContender.response
      .body as ActiveSessionConflictBody;
    const secondConflict = secondContender.response
      .body as ActiveSessionConflictBody;
    const [firstResult, secondResult] = await Promise.all([
      requestTakeover(
        firstContender.agent,
        role,
        `${TEST_PREFIX}-race-first`,
        firstConflict.takeoverToken,
      ),
      requestTakeover(
        secondContender.agent,
        role,
        `${TEST_PREFIX}-race-second`,
        secondConflict.takeoverToken,
      ),
    ]);

    expect([firstResult.status, secondResult.status].sort()).toEqual([
      200, 409,
    ]);
    const winner = firstResult.status === 200 ? firstResult : secondResult;
    const winnerDeviceId = (winner.body as MatchSessionResponseBody).session
      .deviceId;

    const activeSessions = await prisma.matchSession.findMany({
      where: { accessCode: { role }, active: true, matchId },
    });
    expect(activeSessions).toHaveLength(1);
    expect(activeSessions[0]?.deviceId).toBe(winnerDeviceId);

    const firstSessionResponse = await firstContender.agent.get(
      '/api/match-access/session',
    );
    const secondSessionResponse = await secondContender.agent.get(
      '/api/match-access/session',
    );
    expect(
      [firstSessionResponse.status, secondSessionResponse.status].sort(),
    ).toEqual([200, 401]);
  });

  it('recovers a browser session from its HTTP-only cookie after reload', async () => {
    const role = MatchAccessRole.INSPECTOR;
    const deviceId = `${TEST_PREFIX}-recovery-device`;
    const loginResult = await login(role, deviceId);
    expect(loginResult.response.status).toBe(200);
    const cookie = readCookie(loginResult.response.headers);

    const recoveryResponse = await request(app.getHttpServer())
      .get('/api/match-access/session')
      .set('Cookie', cookie.pair)
      .expect(200);
    expect(recoveryResponse.body).toEqual(loginResult.response.body);

    const cookieAttributes = Array.isArray(
      loginResult.response.headers['set-cookie'],
    )
      ? loginResult.response.headers['set-cookie'].join('; ')
      : String(loginResult.response.headers['set-cookie']);
    expect(cookieAttributes).toContain('HttpOnly');
    expect(cookieAttributes).toContain('SameSite=Strict');
    expect(cookieAttributes).toContain('Path=/api');

    const persisted = await prisma.matchSession.findUniqueOrThrow({
      where: {
        id: (loginResult.response.body as MatchSessionResponseBody).session
          .sessionId,
      },
    });
    expect(persisted.tokenHash).not.toBe(cookie.token);
    expect(persisted.tokenHash).not.toContain(cookie.token);
    expect(persisted.tokenHash).not.toContain(rawAccessCodes[role]);

    const storedCredential = await prisma.matchAccessCode.findUniqueOrThrow({
      select: { codeHash: true },
      where: { matchId_role: { matchId, role } },
    });
    expect(storedCredential.codeHash).not.toBe(rawAccessCodes[role]);
    expect(storedCredential.codeHash).not.toContain(rawAccessCodes[role]);
    expectNoRawSecurityCode(loginResult.response.body, rawAccessCodes[role]);
  });

  it('recovers a persisted browser session after ephemeral Redis state is reset', async () => {
    const role = MatchAccessRole.REFEREE_1;
    const loginResult = await login(role, `${TEST_PREFIX}-redis-reset-device`);
    expect(loginResult.response.status).toBe(200);
    const cookie = readCookie(loginResult.response.headers);

    // Redis holds rate limits and other ephemeral coordination only. A loss of
    // that cache must not invalidate a persisted participant session.
    await redis.flushdb();

    await request(app.getHttpServer())
      .get('/api/match-access/session')
      .set('Cookie', cookie.pair)
      .expect(200)
      .expect(loginResult.response.body);
  });

  it('logs out, revokes the persisted session, and clears browser recovery', async () => {
    const role = MatchAccessRole.REFEREE_1;
    const authenticated = await login(role, `${TEST_PREFIX}-logout-device`);
    expect(authenticated.response.status).toBe(200);
    const sessionId = (authenticated.response.body as MatchSessionResponseBody)
      .session.sessionId;

    const logoutResponse = await authenticated.agent
      .post('/api/match-access/logout')
      .expect(204);
    expect(String(logoutResponse.headers['set-cookie'])).toContain('Expires=');
    await authenticated.agent.get('/api/match-access/session').expect(401);

    const persisted = await prisma.matchSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(persisted.active).toBe(false);
    expect(persisted.revokedAt).toBeInstanceOf(Date);
  });
});
