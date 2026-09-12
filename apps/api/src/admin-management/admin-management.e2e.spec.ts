import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AdminEntitlementStatus,
  AthleteColor,
  AuditEventType,
  MatchAccessRole,
  MatchRole,
  MatchStatus,
  RefereeSlot,
  TournamentStatus,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import Redis from 'ioredis';
import request, { type Test as SupertestRequest } from 'supertest';

import { DEFAULT_SPORT } from '../../prisma/default-sport';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { MatchCredentialGeneratorService } from './match-credential-generator.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/14';
const TEST_RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
const TEST_PREFIX = `admin-management-e2e-${TEST_RUN_ID}`;
const TEST_ADMIN_USERNAME = `${TEST_PREFIX}-admin`;
const TEST_ADMIN_PASSWORD = 'Aa1!'.repeat(15);

const requiredAccessRoles = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const;

interface TournamentView {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  status: TournamentStatus;
}

interface AthleteView {
  id: string;
  color: AthleteColor;
  name: string;
  organization: string;
}

interface MatchView {
  id: string;
  tournamentId: string;
  publicId: string;
  status: MatchStatus;
  roundDurationMs: number;
  breakDurationMs: number;
  athletes: AthleteView[];
}

interface RawAccessCode {
  role: MatchAccessRole;
  code: string;
}

interface TournamentResponseBody {
  tournament: TournamentView;
}

interface TournamentListResponseBody {
  tournaments: TournamentView[];
}

interface MatchResponseBody {
  match: MatchView;
}

interface MatchListResponseBody {
  matches: MatchView[];
}

interface MatchCreationResponseBody extends MatchResponseBody {
  accessCodes: RawAccessCode[];
}

interface AccessCodeRegenerationResponseBody {
  matchId: string;
  accessCodes: RawAccessCode[];
}

interface TriggerFixture {
  functionName: string;
  triggerName: string;
}

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '10',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    ADMIN_SESSION_SECRET:
      'admin-management-e2e-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3002',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: TEST_DATABASE_URL,
    MATCH_PUBLIC_ID_INITIAL_LENGTH: '6',
    MATCH_SESSION_SECRET:
      'match-management-e2e-session-secret-with-at-least-thirty-two-characters',
    NODE_ENV: 'test',
    REDIS_URL: TEST_REDIS_URL,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

function readCookie(responseHeaders: Record<string, unknown>): string {
  const setCookie = responseHeaders['set-cookie'];
  const serializedCookie = Array.isArray(setCookie)
    ? String(setCookie[0])
    : String(setCookie ?? '');
  const cookie = serializedCookie.split(';')[0];

  if (cookie === undefined || cookie.length === 0) {
    throw new Error('Admin login did not return a session cookie');
  }

  return cookie;
}

function expectExactlyOneAthletePerColor(athletes: AthleteView[]): void {
  expect(athletes).toHaveLength(2);
  expect(athletes.map(({ color }) => color).sort()).toEqual(
    [AthleteColor.BLUE, AthleteColor.RED].sort(),
  );
}

function sessionRoleForAccessRole(role: MatchAccessRole): {
  role: MatchRole;
  refereeSlot?: RefereeSlot;
} {
  switch (role) {
    case MatchAccessRole.REFEREE_1:
      return { refereeSlot: RefereeSlot.REFEREE_1, role: MatchRole.REFEREE };
    case MatchAccessRole.REFEREE_2:
      return { refereeSlot: RefereeSlot.REFEREE_2, role: MatchRole.REFEREE };
    case MatchAccessRole.REFEREE_3:
      return { refereeSlot: RefereeSlot.REFEREE_3, role: MatchRole.REFEREE };
    case MatchAccessRole.INSPECTOR:
      return { role: MatchRole.INSPECTOR };
  }
}

describe('Admin tournament and match management (integration)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let adminCookie: string;
  let testAdminId: string;
  let credentialGenerator: MatchCredentialGeneratorService;
  const installedTriggers = new Set<TriggerFixture>();

  function authenticated(testRequest: SupertestRequest): SupertestRequest {
    return testRequest.set('Cookie', adminCookie);
  }

  async function createTournament(
    label: string,
    overrides: Record<string, unknown> = {},
  ): Promise<TournamentView> {
    const response = await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({
        name: `${TEST_PREFIX}-${label}`,
        ...overrides,
      })
      .expect(201);

    return (response.body as TournamentResponseBody).tournament;
  }

  async function createMatch(
    tournamentId: string,
    label: string,
    overrides: Record<string, unknown> = {},
  ): Promise<MatchCreationResponseBody> {
    const response = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/matches`,
      ),
    )
      .send({
        athletes: [
          {
            color: AthleteColor.RED,
            name: `${TEST_PREFIX}-${label}-red`,
            organization: 'Red test organization',
          },
          {
            color: AthleteColor.BLUE,
            name: `${TEST_PREFIX}-${label}-blue`,
            organization: 'Blue test organization',
          },
        ],
        ...overrides,
      })
      .expect(201);

    return response.body as MatchCreationResponseBody;
  }

  async function dropTrigger(fixture: TriggerFixture): Promise<void> {
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${fixture.triggerName}" ON "match_access_codes"`,
    );
    await prisma.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${fixture.functionName}"()`,
    );
    installedTriggers.delete(fixture);
  }

  async function cleanTestData(): Promise<void> {
    if (testAdminId !== undefined) {
      await prisma.auditLog.deleteMany({
        where: { adminUserId: testAdminId },
      });
    }

    const tournaments = await prisma.tournament.findMany({
      select: { id: true },
      where: { name: { startsWith: TEST_PREFIX } },
    });
    const tournamentIds = tournaments.map(({ id }) => id);

    if (tournamentIds.length > 0) {
      await prisma.match.deleteMany({
        where: { tournamentId: { in: tournamentIds } },
      });
      await prisma.tournament.deleteMany({
        where: { id: { in: tournamentIds } },
      });
    }

    await prisma.user.deleteMany({
      where: { username: TEST_ADMIN_USERNAME },
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
    credentialGenerator = app.get(MatchCredentialGeneratorService);
    redis = new Redis(TEST_REDIS_URL, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    await redis.flushdb();

    const testAdmin = await prisma.user.create({
      data: {
        adminEntitlement: {
          create: {
            activeFrom: new Date(Date.now() - 60_000),
            activeUntil: new Date(Date.now() + 86_400_000),
            status: AdminEntitlementStatus.ACTIVE,
            tournamentLimit: 100,
          },
        },
        normalizedUsername: TEST_ADMIN_USERNAME,
        passwordHash: await hash(TEST_ADMIN_PASSWORD, 10),
        username: TEST_ADMIN_USERNAME,
      },
      select: { id: true },
    });
    testAdminId = testAdmin.id;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        password: TEST_ADMIN_PASSWORD,
        username: TEST_ADMIN_USERNAME,
      })
      .expect(200);
    adminCookie = readCookie(loginResponse.headers);
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      for (const trigger of [...installedTriggers]) {
        await dropTrigger(trigger);
      }
      await cleanTestData();
    }

    if (redis !== undefined) {
      await redis.flushdb();
      await redis.quit();
    }

    if (app !== undefined) {
      await app.close();
    }
  });

  it('protects admin management endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/tournaments')
      .expect(401)
      .expect({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
  });

  it('creates, lists, reads, updates, and archives a tournament', async () => {
    const tournament = await createTournament('crud', {
      description: 'Initial description',
      endDate: '2026-10-12',
      location: 'Initial venue',
      startDate: '2026-10-10',
    });

    expect(tournament).toMatchObject({
      description: 'Initial description',
      location: 'Initial venue',
      status: TournamentStatus.DRAFT,
    });
    await expect(
      prisma.tournament.findUniqueOrThrow({
        where: { id: tournament.id },
        select: { sport: { select: { code: true } } },
      }),
    ).resolves.toEqual({ sport: { code: DEFAULT_SPORT.code } });

    const listResponse = await authenticated(
      request(app.getHttpServer()).get('/api/admin/tournaments'),
    ).expect(200);
    const listed = (listResponse.body as TournamentListResponseBody)
      .tournaments;
    expect(listed.some(({ id }) => id === tournament.id)).toBe(true);

    await authenticated(
      request(app.getHttpServer()).get(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    )
      .expect(200)
      .expect(({ body }) => {
        expect((body as TournamentResponseBody).tournament.id).toBe(
          tournament.id,
        );
      });

    const updateResponse = await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    )
      .send({
        description: 'Updated description',
        location: 'Updated venue',
        status: TournamentStatus.ACTIVE,
      })
      .expect(200);
    expect(
      (updateResponse.body as TournamentResponseBody).tournament,
    ).toMatchObject({
      description: 'Updated description',
      location: 'Updated venue',
      status: TournamentStatus.ACTIVE,
    });

    const archiveResponse = await authenticated(
      request(app.getHttpServer()).delete(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    ).expect(200);
    expect(
      (archiveResponse.body as TournamentResponseBody).tournament.status,
    ).toBe(TournamentStatus.ARCHIVED);

    const persistedTournament = await prisma.tournament.findUniqueOrThrow({
      where: { id: tournament.id },
    });
    expect(persistedTournament.status).toBe(TournamentStatus.ARCHIVED);

    const auditEvents = await prisma.auditLog.findMany({
      select: { eventType: true },
      where: {
        adminUserId: testAdminId,
        eventType: {
          in: [
            AuditEventType.TOURNAMENT_CREATED,
            AuditEventType.TOURNAMENT_UPDATED,
          ],
        },
        metadata: { path: ['tournamentId'], equals: tournament.id },
      },
    });
    expect(auditEvents.map(({ eventType }) => eventType)).toEqual(
      expect.arrayContaining([
        AuditEventType.TOURNAMENT_CREATED,
        AuditEventType.TOURNAMENT_UPDATED,
      ]),
    );
  });

  it('rejects null for optional fields that are not nullable', async () => {
    await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({ name: `${TEST_PREFIX}-null-create-status`, status: null })
      .expect(400);

    const tournament = await createTournament('non-null-validation');
    const tournamentEndpoint = `/api/admin/tournaments/${tournament.id}`;

    await authenticated(request(app.getHttpServer()).patch(tournamentEndpoint))
      .send({ name: null })
      .expect(400);
    await authenticated(request(app.getHttpServer()).patch(tournamentEndpoint))
      .send({ status: null })
      .expect(400);

    await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournament.id}/matches`,
      ),
    )
      .send({
        athletes: [
          {
            color: AthleteColor.RED,
            name: `${TEST_PREFIX}-null-duration-red`,
            organization: 'Null validation organization',
          },
          {
            color: AthleteColor.BLUE,
            name: `${TEST_PREFIX}-null-duration-blue`,
            organization: 'Null validation organization',
          },
        ],
        roundDurationMs: null,
      })
      .expect(400);

    const creation = await createMatch(tournament.id, 'non-null-validation');
    const matchEndpoint = `/api/admin/matches/${creation.match.id}`;

    await authenticated(request(app.getHttpServer()).patch(matchEndpoint))
      .send({ athletes: null })
      .expect(400);
    await authenticated(request(app.getHttpServer()).patch(matchEndpoint))
      .send({ roundDurationMs: null })
      .expect(400);
    await authenticated(request(app.getHttpServer()).patch(matchEndpoint))
      .send({ status: null })
      .expect(400);
  });

  it('rejects anything other than exactly one RED and one BLUE athlete', async () => {
    const tournament = await createTournament('athlete-validation');
    const endpoint = `/api/admin/tournaments/${tournament.id}/matches`;
    const athlete = {
      color: AthleteColor.RED,
      name: `${TEST_PREFIX}-validation-red`,
      organization: 'Validation organization',
    };

    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send({ athletes: [athlete] })
      .expect(400);

    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send({ athletes: [athlete, athlete, athlete] })
      .expect(400);

    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send({
        athletes: [
          athlete,
          {
            ...athlete,
            name: `${TEST_PREFIX}-validation-second-red`,
          },
        ],
      })
      .expect(400)
      .expect({
        code: 'INVALID_MATCH_ATHLETES',
        message:
          'A match requires exactly one RED athlete and one BLUE athlete',
      });

    expect(
      await prisma.match.count({ where: { tournamentId: tournament.id } }),
    ).toBe(0);
  });

  it('atomically creates a match with two athletes and four one-time raw codes', async () => {
    const tournament = await createTournament('match-create');
    const creation = await createMatch(tournament.id, 'match-create', {
      breakDurationMs: 45_000,
      roundDurationMs: 90_000,
    });

    expect(creation.match).toMatchObject({
      breakDurationMs: 45_000,
      roundDurationMs: 90_000,
      status: MatchStatus.WAITING,
      tournamentId: tournament.id,
    });
    expect(creation.match.publicId).toHaveLength(6);
    expect(creation.match.publicId).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/,
    );
    expectExactlyOneAthletePerColor(creation.match.athletes);

    expect(creation.accessCodes).toHaveLength(4);
    expect(creation.accessCodes.map(({ role }) => role).sort()).toEqual(
      [...requiredAccessRoles].sort(),
    );
    for (const accessCode of creation.accessCodes) {
      expect(accessCode.code).toMatch(
        /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/,
      );
    }

    const storedCodes = await prisma.matchAccessCode.findMany({
      where: { matchId: creation.match.id },
    });
    expect(storedCodes).toHaveLength(4);
    await Promise.all(
      creation.accessCodes.map(async ({ code, role }) => {
        const stored = storedCodes.find((candidate) => candidate.role === role);

        expect(stored).toBeDefined();
        expect(stored?.codeHash).not.toBe(code);
        await expect(compare(code, stored?.codeHash ?? '')).resolves.toBe(true);
      }),
    );

    const listResponse = await authenticated(
      request(app.getHttpServer()).get(
        `/api/admin/tournaments/${tournament.id}/matches`,
      ),
    ).expect(200);
    expect(
      (listResponse.body as MatchListResponseBody).matches.some(
        ({ id }) => id === creation.match.id,
      ),
    ).toBe(true);
    for (const { code } of creation.accessCodes) {
      expect(JSON.stringify(listResponse.body)).not.toContain(code);
    }

    const getResponse = await authenticated(
      request(app.getHttpServer()).get(
        `/api/admin/matches/${creation.match.id}`,
      ),
    ).expect(200);
    const fetchedMatch = (getResponse.body as MatchResponseBody).match;
    expect(fetchedMatch.id).toBe(creation.match.id);
    expectExactlyOneAthletePerColor(fetchedMatch.athletes);
    for (const { code } of creation.accessCodes) {
      expect(JSON.stringify(getResponse.body)).not.toContain(code);
    }

    const audit = await prisma.auditLog.findFirst({
      where: {
        adminUserId: testAdminId,
        eventType: AuditEventType.MATCH_CREATED,
        matchId: creation.match.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('enforces public ID uniqueness and safely retries a collision', async () => {
    const tournament = await createTournament('public-id-collision');
    expect(credentialGenerator.generatePublicId(8)).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/,
    );
    let collidingPublicId = credentialGenerator.generatePublicId();

    while (
      (await prisma.match.findUnique({
        select: { id: true },
        where: { publicId: collidingPublicId },
      })) !== null
    ) {
      collidingPublicId = credentialGenerator.generatePublicId();
    }

    await prisma.match.create({
      data: {
        breakDurationMs: 60_000,
        publicId: collidingPublicId,
        roundDurationMs: 120_000,
        tournamentId: tournament.id,
      },
    });

    await expect(
      prisma.match.create({
        data: {
          breakDurationMs: 60_000,
          publicId: collidingPublicId,
          roundDurationMs: 120_000,
          tournamentId: tournament.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    let retryPublicId = credentialGenerator.generatePublicId();
    while (
      retryPublicId === collidingPublicId ||
      (await prisma.match.findUnique({
        select: { id: true },
        where: { publicId: retryPublicId },
      })) !== null
    ) {
      retryPublicId = credentialGenerator.generatePublicId();
    }

    const generatorSpy = jest
      .spyOn(credentialGenerator, 'generatePublicId')
      .mockReturnValueOnce(collidingPublicId)
      .mockReturnValueOnce(retryPublicId);

    try {
      const creation = await createMatch(tournament.id, 'collision-retry');

      expect(creation.match.publicId).toBe(retryPublicId);
      expect(creation.accessCodes).toHaveLength(4);
      expect(generatorSpy).toHaveBeenCalledTimes(2);
    } finally {
      generatorSpy.mockRestore();
    }
  });

  it('reads and updates match settings and both athletes', async () => {
    const tournament = await createTournament('match-update');
    const creation = await createMatch(tournament.id, 'before-update');
    const updatedAthletes = [
      {
        color: AthleteColor.BLUE,
        name: `${TEST_PREFIX}-updated-blue`,
        organization: 'Updated blue organization',
      },
      {
        color: AthleteColor.RED,
        name: `${TEST_PREFIX}-updated-red`,
        organization: 'Updated red organization',
      },
    ];

    const response = await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/matches/${creation.match.id}`,
      ),
    )
      .send({
        athletes: updatedAthletes,
        breakDurationMs: 30_000,
        roundDurationMs: 100_000,
      })
      .expect(200);
    const updatedMatch = (response.body as MatchResponseBody).match;

    expect(updatedMatch).toMatchObject({
      breakDurationMs: 30_000,
      roundDurationMs: 100_000,
    });
    expectExactlyOneAthletePerColor(updatedMatch.athletes);
    expect(updatedMatch.athletes).toEqual(
      expect.arrayContaining(
        updatedAthletes.map((athlete) => expect.objectContaining(athlete)),
      ),
    );

    const audit = await prisma.auditLog.findFirst({
      where: {
        adminUserId: testAdminId,
        eventType: AuditEventType.MATCH_UPDATED,
        matchId: creation.match.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('does not allow an admin match update to bypass the inspector lifecycle', async () => {
    const tournament = await createTournament('match-status-protected');
    const creation = await createMatch(tournament.id, 'match-status-protected');

    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/matches/${creation.match.id}`,
      ),
    )
      .send({ status: MatchStatus.ROUND_1_RUNNING })
      .expect(400);

    const persisted = await prisma.match.findUniqueOrThrow({
      select: { currentRound: true, status: true },
      where: { id: creation.match.id },
    });

    expect(persisted).toEqual({
      currentRound: null,
      status: MatchStatus.WAITING,
    });
  });

  it('regenerates individual or all codes and revokes dependent sessions', async () => {
    const tournament = await createTournament('code-regeneration');
    const creation = await createMatch(tournament.id, 'code-regeneration');
    const originalCodes = await prisma.matchAccessCode.findMany({
      where: { matchId: creation.match.id },
    });
    const originalHashByRole = new Map(
      originalCodes.map(({ codeHash, role }) => [role, codeHash]),
    );
    const refereeOneCode = originalCodes.find(
      ({ role }) => role === MatchAccessRole.REFEREE_1,
    );
    const inspectorCode = originalCodes.find(
      ({ role }) => role === MatchAccessRole.INSPECTOR,
    );

    expect(refereeOneCode).toBeDefined();
    expect(inspectorCode).toBeDefined();
    const [dependentSession, independentSession] = await Promise.all([
      prisma.matchSession.create({
        data: {
          accessCodeId: refereeOneCode?.id ?? '',
          deviceId: `${TEST_PREFIX}-individual-referee-device`,
          matchId: creation.match.id,
          refereeSlot: RefereeSlot.REFEREE_1,
          role: MatchRole.REFEREE,
          tokenHash: `${TEST_PREFIX}-individual-referee-token`,
        },
      }),
      prisma.matchSession.create({
        data: {
          accessCodeId: inspectorCode?.id ?? '',
          deviceId: `${TEST_PREFIX}-individual-inspector-device`,
          matchId: creation.match.id,
          role: MatchRole.INSPECTOR,
          tokenHash: `${TEST_PREFIX}-individual-inspector-token`,
        },
      }),
    ]);

    const individualResponse = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/matches/${creation.match.id}/access-codes/${MatchAccessRole.REFEREE_1}/regenerate`,
      ),
    ).expect(200);
    const individualResult =
      individualResponse.body as AccessCodeRegenerationResponseBody;

    expect(individualResult.matchId).toBe(creation.match.id);
    expect(individualResult.accessCodes).toHaveLength(1);
    expect(individualResult.accessCodes[0]?.role).toBe(
      MatchAccessRole.REFEREE_1,
    );
    const afterIndividual = await prisma.matchAccessCode.findMany({
      where: { matchId: creation.match.id },
    });
    const changedRefereeCode = afterIndividual.find(
      ({ role }) => role === MatchAccessRole.REFEREE_1,
    );
    expect(changedRefereeCode?.codeHash).not.toBe(
      originalHashByRole.get(MatchAccessRole.REFEREE_1),
    );
    await expect(
      compare(
        individualResult.accessCodes[0]?.code ?? '',
        changedRefereeCode?.codeHash ?? '',
      ),
    ).resolves.toBe(true);
    expect(
      afterIndividual.find(({ role }) => role === MatchAccessRole.INSPECTOR)
        ?.codeHash,
    ).toBe(originalHashByRole.get(MatchAccessRole.INSPECTOR));

    const [revokedDependent, stillActiveIndependent] = await Promise.all([
      prisma.matchSession.findUniqueOrThrow({
        where: { id: dependentSession.id },
      }),
      prisma.matchSession.findUniqueOrThrow({
        where: { id: independentSession.id },
      }),
    ]);
    expect(revokedDependent).toMatchObject({ active: false });
    expect(revokedDependent.revokedAt).not.toBeNull();
    expect(stillActiveIndependent).toMatchObject({
      active: true,
      revokedAt: null,
    });

    const sessionsForAll = await Promise.all(
      afterIndividual.map(async ({ id, role }, index) => {
        if (role === MatchAccessRole.INSPECTOR) {
          return independentSession;
        }

        const sessionRole = sessionRoleForAccessRole(role);

        return prisma.matchSession.create({
          data: {
            accessCodeId: id,
            deviceId: `${TEST_PREFIX}-all-device-${index}`,
            matchId: creation.match.id,
            refereeSlot: sessionRole.refereeSlot,
            role: sessionRole.role,
            tokenHash: `${TEST_PREFIX}-all-token-${index}`,
          },
        });
      }),
    );
    const hashesBeforeAll = new Map(
      afterIndividual.map(({ codeHash, role }) => [role, codeHash]),
    );

    const allResponse = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/matches/${creation.match.id}/access-codes/regenerate`,
      ),
    ).expect(200);
    const allResult = allResponse.body as AccessCodeRegenerationResponseBody;

    expect(allResult.matchId).toBe(creation.match.id);
    expect(allResult.accessCodes).toHaveLength(4);
    expect(allResult.accessCodes.map(({ role }) => role).sort()).toEqual(
      [...requiredAccessRoles].sort(),
    );

    const afterAllCodes = await prisma.matchAccessCode.findMany({
      where: { matchId: creation.match.id },
    });
    await Promise.all(
      allResult.accessCodes.map(async ({ code, role }) => {
        const persisted = afterAllCodes.find(
          (candidate) => candidate.role === role,
        );

        expect(persisted?.codeHash).not.toBe(hashesBeforeAll.get(role));
        expect(persisted?.codeHash).not.toBe(code);
        await expect(compare(code, persisted?.codeHash ?? '')).resolves.toBe(
          true,
        );
      }),
    );

    const sessionsAfterAll = await prisma.matchSession.findMany({
      where: { id: { in: sessionsForAll.map(({ id }) => id) } },
    });
    expect(sessionsAfterAll).toHaveLength(4);
    expect(
      sessionsAfterAll.every(
        ({ active, revokedAt }) => !active && revokedAt !== null,
      ),
    ).toBe(true);

    const regenerationAuditCount = await prisma.auditLog.count({
      where: {
        adminUserId: testAdminId,
        eventType: AuditEventType.MATCH_CODE_REGENERATED,
        matchId: creation.match.id,
      },
    });
    expect(regenerationAuditCount).toBe(2);
  });

  it('rolls back match, athletes, codes, and audit when credential insertion fails', async () => {
    const tournament = await createTournament('transaction-rollback');
    const safeSuffix = `${process.pid}_${Date.now().toString(36)}`;
    const trigger: TriggerFixture = {
      functionName: `admin_match_rollback_fn_${safeSuffix}`,
      triggerName: `admin_match_rollback_tr_${safeSuffix}`,
    };
    const redName = `${TEST_PREFIX}-rollback-red`;
    const blueName = `${TEST_PREFIX}-rollback-blue`;
    const matchAuditCountBefore = await prisma.auditLog.count({
      where: {
        adminUserId: testAdminId,
        eventType: AuditEventType.MATCH_CREATED,
      },
    });

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${trigger.functionName}"() RETURNS trigger AS $test_trigger$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "matches"
          WHERE "id" = NEW."match_id"
            AND "tournament_id" = '${tournament.id}'::uuid
        ) THEN
          RAISE EXCEPTION 'forced match access code insertion failure';
        END IF;
        RETURN NEW;
      END;
      $test_trigger$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${trigger.triggerName}"
      BEFORE INSERT ON "match_access_codes"
      FOR EACH ROW EXECUTE FUNCTION "${trigger.functionName}"()
    `);
    installedTriggers.add(trigger);

    try {
      await authenticated(
        request(app.getHttpServer()).post(
          `/api/admin/tournaments/${tournament.id}/matches`,
        ),
      )
        .send({
          athletes: [
            {
              color: AthleteColor.RED,
              name: redName,
              organization: 'Rollback red organization',
            },
            {
              color: AthleteColor.BLUE,
              name: blueName,
              organization: 'Rollback blue organization',
            },
          ],
        })
        .expect(500);
    } finally {
      await dropTrigger(trigger);
    }

    expect(
      await prisma.match.count({ where: { tournamentId: tournament.id } }),
    ).toBe(0);
    expect(
      await prisma.matchAthlete.count({
        where: { name: { in: [redName, blueName] } },
      }),
    ).toBe(0);
    expect(
      await prisma.matchAccessCode.count({
        where: { match: { tournamentId: tournament.id } },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          adminUserId: testAdminId,
          eventType: AuditEventType.MATCH_CREATED,
        },
      }),
    ).toBe(matchAuditCountBefore);
  });

  it('denies admin GET and mutation access before an ACTIVE entitlement begins', async () => {
    const now = new Date();
    const activeFrom = new Date(now.getTime() + 60_000);
    const activeUntil = new Date(activeFrom.getTime() + 86_400_000);

    await prisma.user.update({
      data: { role: 'ADMIN' },
      where: { id: testAdminId },
    });
    await prisma.adminEntitlement.upsert({
      create: {
        activeFrom,
        activeUntil,
        status: AdminEntitlementStatus.ACTIVE,
        tournamentLimit: 1,
        userId: testAdminId,
      },
      update: {
        activeFrom,
        activeUntil,
        adminAccessEndedAt: null,
        status: AdminEntitlementStatus.ACTIVE,
        tournamentLimit: 1,
      },
      where: { userId: testAdminId },
    });

    await authenticated(
      request(app.getHttpServer()).get('/api/admin/tournaments'),
    ).expect(403);
    await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({ name: `${TEST_PREFIX}-future-entitlement` })
      .expect(403);
  });
});
