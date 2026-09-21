import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AdminEntitlementStatus,
  AthleteColor,
  AuditEventType,
  MatchAccessRole,
  MatchRole,
  MatchLifecycle,
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
  publicCode: string;
  name: string;
  description: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  status: TournamentStatus;
  sportId: string;
  sport: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    sportGroup: { id: string; code: string; name: string };
  };
}

interface AthleteView {
  id: string;
  athleteId: string | null;
  color: AthleteColor;
  name: string;
  organization: string | null;
}

interface RosterItemView {
  id: string;
  name: string;
  isActive: boolean;
}

interface RosterAthleteView extends RosterItemView {
  organizationId: string | null;
  weightClassId: string;
}

interface MatchView {
  id: string;
  tournamentId: string;
  publicId: string;
  status: MatchStatus;
  phase: MatchStatus;
  lifecycle: MatchLifecycle;
  displayState: string;
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
  let alternateSportId: string;
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
        sportId: DEFAULT_SPORT.id,
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
    const weightClass = await createWeightClass(
      tournamentId,
      `${label}-weight`,
    );
    const [red, blue] = await Promise.all([
      createAthlete(tournamentId, `${label}-red`, weightClass.id),
      createAthlete(tournamentId, `${label}-blue`, weightClass.id),
    ]);
    return createMatchWithAthletes(tournamentId, red.id, blue.id, overrides);
  }

  async function createWeightClass(
    tournamentId: string,
    label: string,
    overrides: Record<string, unknown> = {},
  ): Promise<RosterItemView> {
    const response = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/weight-classes`,
      ),
    )
      .send({ name: `${TEST_PREFIX}-${label}`, ...overrides })
      .expect(201);
    return (response.body as { weightClass: RosterItemView }).weightClass;
  }

  async function createOrganization(
    tournamentId: string,
    label: string,
    overrides: Record<string, unknown> = {},
  ): Promise<RosterItemView> {
    const response = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/organizations`,
      ),
    )
      .send({ name: `${TEST_PREFIX}-${label}`, ...overrides })
      .expect(201);
    return (response.body as { organization: RosterItemView }).organization;
  }

  async function createAthlete(
    tournamentId: string,
    label: string,
    weightClassId: string,
    organizationId?: string | null,
    overrides: Record<string, unknown> = {},
  ): Promise<RosterAthleteView> {
    const response = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/athletes`,
      ),
    )
      .send({
        birthYear: 2000,
        name: `${TEST_PREFIX}-${label}`,
        organizationId,
        weightClassId,
        ...overrides,
      })
      .expect(201);
    return (response.body as { athlete: RosterAthleteView }).athlete;
  }

  async function createMatchWithAthletes(
    tournamentId: string,
    redAthleteId: string,
    blueAthleteId: string,
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
            athleteId: redAthleteId,
          },
          {
            color: AthleteColor.BLUE,
            athleteId: blueAthleteId,
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

    const alternateSport = await prisma.sport.create({
      data: {
        code: `${TEST_PREFIX}-ALT`.toUpperCase(),
        name: `${TEST_PREFIX} Alternate Sport`,
        normalizedName: `${TEST_PREFIX} alternate sport`,
        sportGroupId: '4a78ed51-2fb6-4c9c-a1ec-f054873d6101',
      },
      select: { id: true },
    });
    alternateSportId = alternateSport.id;

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
      await prisma.sport.deleteMany({ where: { id: alternateSportId } });
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
      sportId: DEFAULT_SPORT.id,
      sport: {
        id: DEFAULT_SPORT.id,
        code: DEFAULT_SPORT.code,
        name: DEFAULT_SPORT.name,
        isActive: true,
      },
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

    await authenticated(request(app.getHttpServer()).get('/api/tournaments'))
      .expect(200)
      .expect(({ body }) => {
        const item = (body as { items: TournamentView[] }).items.find(
          ({ id }) => id === tournament.id,
        );
        expect(item).toMatchObject({
          sport: {
            id: DEFAULT_SPORT.id,
            code: DEFAULT_SPORT.code,
            name: DEFAULT_SPORT.name,
          },
        });
        expect(item).not.toHaveProperty('sport.isActive');
      });
    await authenticated(
      request(app.getHttpServer()).get(`/api/tournaments/${tournament.id}`),
    )
      .expect(200)
      .expect(({ body }) => {
        expect((body as TournamentResponseBody).tournament).toMatchObject({
          sport: { id: DEFAULT_SPORT.id, code: DEFAULT_SPORT.code },
        });
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

  it('generates human-friendly tournament public codes and retries collisions', async () => {
    const existing = await createTournament('public-code-collision');
    expect(existing.publicCode).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/,
    );
    let replacement = credentialGenerator.generateTournamentPublicCode();
    while (replacement === existing.publicCode) {
      replacement = credentialGenerator.generateTournamentPublicCode();
    }
    const spy = jest
      .spyOn(credentialGenerator, 'generateTournamentPublicCode')
      .mockReturnValueOnce(existing.publicCode)
      .mockReturnValueOnce(replacement);
    try {
      await expect(
        createTournament('public-code-retry'),
      ).resolves.toMatchObject({
        publicCode: replacement,
      });
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
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

  it('requires an active, existing Sport when creating a tournament', async () => {
    await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({ name: `${TEST_PREFIX}-missing-sport` })
      .expect(400);
    await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({
        name: `${TEST_PREFIX}-unknown-sport`,
        sportId: '00000000-0000-4000-8000-000000000001',
      })
      .expect(404)
      .expect({ code: 'SPORT_NOT_FOUND', message: 'Sport not found' });

    await prisma.sport.update({
      data: { isActive: false },
      where: { id: alternateSportId },
    });
    await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({
        name: `${TEST_PREFIX}-inactive-sport`,
        sportId: alternateSportId,
      })
      .expect(409)
      .expect({ code: 'SPORT_INACTIVE', message: 'Sport is inactive' });
    await prisma.sport.update({
      data: { isActive: true },
      where: { id: alternateSportId },
    });
  });

  it('allows Sport changes before the first Match and rejects them afterwards', async () => {
    const tournament = await createTournament('sport-change');

    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    )
      .send({ sportId: DEFAULT_SPORT.id })
      .expect(200)
      .expect(({ body }) => {
        expect((body as TournamentResponseBody).tournament.sportId).toBe(
          DEFAULT_SPORT.id,
        );
      });

    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    )
      .send({ sportId: alternateSportId })
      .expect(200)
      .expect(({ body }) => {
        expect((body as TournamentResponseBody).tournament.sportId).toBe(
          alternateSportId,
        );
      });

    await createMatch(tournament.id, 'sport-change');
    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    )
      .send({ sportId: DEFAULT_SPORT.id })
      .expect(409)
      .expect({
        code: 'TOURNAMENT_SPORT_CHANGE_NOT_ALLOWED',
        message: 'Tournament sport cannot change after matches exist',
      });

    await prisma.sport.update({
      data: { isActive: false },
      where: { id: DEFAULT_SPORT.id },
    });
    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    )
      .send({ sportId: DEFAULT_SPORT.id })
      .expect(409)
      .expect({ code: 'SPORT_INACTIVE', message: 'Sport is inactive' });
    await prisma.sport.update({
      data: { isActive: true },
      where: { id: DEFAULT_SPORT.id },
    });
  });

  it('rejects anything other than exactly one RED and one BLUE athlete', async () => {
    const tournament = await createTournament('athlete-validation');
    const endpoint = `/api/admin/tournaments/${tournament.id}/matches`;
    const weightClass = await createWeightClass(tournament.id, 'validation');
    const rosterAthlete = await createAthlete(
      tournament.id,
      'validation-athlete',
      weightClass.id,
    );
    const athlete = {
      color: AthleteColor.RED,
      athleteId: rosterAthlete.id,
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
            color: AthleteColor.RED,
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

  it('atomically creates a match with two athletes, staffing snapshot, and no modern codes', async () => {
    const tournament = await createTournament('match-create');
    const creation = await createMatch(tournament.id, 'match-create', {
      breakDurationMs: 45_000,
      roundDurationMs: 90_000,
      requiredRefereeCount: 3,
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
    const storedAthletes = await prisma.matchAthlete.findMany({
      orderBy: { color: 'asc' },
      where: { matchId: creation.match.id },
    });
    expect(storedAthletes.every(({ athleteId }) => athleteId !== null)).toBe(
      true,
    );
    expect(storedAthletes.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        `${TEST_PREFIX}-match-create-red`,
        `${TEST_PREFIX}-match-create-blue`,
      ]),
    );

    expect(creation.accessCodes).toEqual([]);

    const storedCodes = await prisma.matchAccessCode.findMany({
      where: { matchId: creation.match.id },
    });
    expect(storedCodes).toHaveLength(0);

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
    expect(fetchedMatch).toMatchObject({
      lifecycle: MatchLifecycle.NOT_STARTED,
      phase: MatchStatus.WAITING,
      status: MatchStatus.WAITING,
      displayState: 'NOT_STARTED',
    });
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

  it('uses roster snapshots and rejects invalid roster selections at the HTTP boundary', async () => {
    const tournament = await createTournament('roster-contract');
    const weight = await createWeightClass(
      tournament.id,
      'roster-contract-weight',
    );
    const organization = await createOrganization(
      tournament.id,
      'roster-contract-organization',
    );
    const [red, blue] = await Promise.all([
      createAthlete(
        tournament.id,
        'roster-contract-red',
        weight.id,
        organization.id,
      ),
      createAthlete(tournament.id, 'roster-contract-blue', weight.id),
    ]);
    const endpoint = `/api/admin/tournaments/${tournament.id}/matches`;

    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send({
        athletes: [
          {
            color: AthleteColor.RED,
            name: 'obsolete',
            organization: 'obsolete',
          },
          {
            color: AthleteColor.BLUE,
            name: 'obsolete blue',
            organization: 'obsolete blue',
          },
        ],
      })
      .expect(400);
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send({
        athletes: [
          { color: AthleteColor.RED, athleteId: red.id },
          { color: AthleteColor.BLUE, athleteId: red.id },
        ],
      })
      .expect(400)
      .expect({
        code: 'DUPLICATE_MATCH_ATHLETE',
        message: 'An athlete may only appear once in a match',
      });
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send({
        athletes: [
          { color: AthleteColor.RED, athleteId: 'not-a-uuid' },
          { color: AthleteColor.BLUE, athleteId: blue.id },
        ],
      })
      .expect(400);

    const creation = await createMatchWithAthletes(
      tournament.id,
      red.id,
      blue.id,
    );
    const persisted = await prisma.match.findUniqueOrThrow({
      include: { athletes: { orderBy: { color: 'asc' } } },
      where: { id: creation.match.id },
    });
    expect(persisted.weightClassId).toBe(weight.id);
    expect(persisted.athletes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          athleteId: red.id,
          name: `${TEST_PREFIX}-roster-contract-red`,
          organization: `${TEST_PREFIX}-roster-contract-organization`,
        }),
        expect.objectContaining({
          athleteId: blue.id,
          name: `${TEST_PREFIX}-roster-contract-blue`,
          organization: null,
        }),
      ]),
    );

    await prisma.tournamentAthlete.update({
      data: { name: 'renamed roster athlete', isActive: false },
      where: { id: red.id },
    });
    await prisma.tournamentOrganization.update({
      data: { isActive: false, name: 'renamed organization' },
      where: { id: organization.id },
    });
    const snapshot = await prisma.matchAthlete.findMany({
      where: { matchId: creation.match.id },
    });
    expect(snapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          athleteId: red.id,
          name: `${TEST_PREFIX}-roster-contract-red`,
          organization: `${TEST_PREFIX}-roster-contract-organization`,
        }),
      ]),
    );
  });

  it('rejects roster-backed match creation in an archived tournament', async () => {
    const tournament = await createTournament('archived-roster-match');
    const weight = await createWeightClass(tournament.id, 'archived-weight');
    const [red, blue] = await Promise.all([
      createAthlete(tournament.id, 'archived-red', weight.id),
      createAthlete(tournament.id, 'archived-blue', weight.id),
    ]);
    await authenticated(
      request(app.getHttpServer()).delete(
        `/api/admin/tournaments/${tournament.id}`,
      ),
    ).expect(200);
    await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournament.id}/matches`,
      ),
    )
      .send({
        athletes: [
          { color: AthleteColor.RED, athleteId: red.id },
          { color: AthleteColor.BLUE, athleteId: blue.id },
        ],
      })
      .expect(409)
      .expect({
        code: 'TOURNAMENT_ARCHIVED',
        message: 'Matches cannot be created in an archived tournament',
      });
  });

  it('rejects cross-tournament, inactive, mismatched, inactive-class, and inactive-organization selections', async () => {
    const tournament = await createTournament('roster-rejections');
    const otherTournament = await createTournament('roster-other');
    const weight = await createWeightClass(tournament.id, 'rejections-weight');
    const otherWeight = await createWeightClass(
      tournament.id,
      'rejections-other-weight',
    );
    const [red, blue, mismatched, inactive] = await Promise.all([
      createAthlete(tournament.id, 'rejections-red', weight.id),
      createAthlete(tournament.id, 'rejections-blue', weight.id),
      createAthlete(tournament.id, 'rejections-mismatched', otherWeight.id),
      createAthlete(tournament.id, 'rejections-inactive', weight.id),
    ]);
    const foreignWeight = await createWeightClass(
      otherTournament.id,
      'foreign-weight',
    );
    const foreign = await createAthlete(
      otherTournament.id,
      'foreign',
      foreignWeight.id,
    );
    const endpoint = `/api/admin/tournaments/${tournament.id}/matches`;
    const selection = (blueId: string) => ({
      athletes: [
        { color: AthleteColor.RED, athleteId: red.id },
        { color: AthleteColor.BLUE, athleteId: blueId },
      ],
    });
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send(selection(foreign.id))
      .expect(404);
    await prisma.tournamentAthlete.update({
      data: { isActive: false },
      where: { id: inactive.id },
    });
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send(selection(inactive.id))
      .expect(409);
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send(selection(mismatched.id))
      .expect(400);
    const organization = await createOrganization(
      tournament.id,
      'rejections-organization',
    );
    const organizationAthlete = await createAthlete(
      tournament.id,
      'rejections-organization-athlete',
      weight.id,
      organization.id,
    );
    await prisma.tournamentOrganization.update({
      data: { isActive: false },
      where: { id: organization.id },
    });
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send(selection(organizationAthlete.id))
      .expect(409);
    await prisma.tournamentWeightClass.update({
      data: { isActive: false },
      where: { id: weight.id },
    });
    await authenticated(request(app.getHttpServer()).post(endpoint))
      .send(selection(blue.id))
      .expect(409);
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
      expect(creation.accessCodes).toEqual([]);
      expect(generatorSpy).toHaveBeenCalledTimes(2);
    } finally {
      generatorSpy.mockRestore();
    }
  });

  it('reads and updates match settings and both athletes', async () => {
    const tournament = await createTournament('match-update');
    const creation = await createMatch(tournament.id, 'before-update');
    const weightClass = await createWeightClass(
      tournament.id,
      'updated-weight',
    );
    const updatedOrganization = await createOrganization(
      tournament.id,
      'updated-organization',
    );
    const [updatedBlue, updatedRed] = await Promise.all([
      createAthlete(
        tournament.id,
        'updated-blue',
        weightClass.id,
        updatedOrganization.id,
      ),
      createAthlete(
        tournament.id,
        'updated-red',
        weightClass.id,
        updatedOrganization.id,
      ),
    ]);
    const updatedAthletes = [
      {
        color: AthleteColor.BLUE,
        athleteId: updatedBlue.id,
      },
      {
        color: AthleteColor.RED,
        athleteId: updatedRed.id,
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

  it('does not partially replace athletes after match activity has begun', async () => {
    const tournament = await createTournament('unsafe-athlete-replacement');
    const creation = await createMatch(
      tournament.id,
      'unsafe-athlete-replacement',
    );
    const before = await prisma.matchAthlete.findMany({
      orderBy: { color: 'asc' },
      where: { matchId: creation.match.id },
    });
    const weight = await createWeightClass(
      tournament.id,
      'unsafe-replacement-weight',
    );
    const [red, blue] = await Promise.all([
      createAthlete(tournament.id, 'unsafe-replacement-red', weight.id),
      createAthlete(tournament.id, 'unsafe-replacement-blue', weight.id),
    ]);
    await prisma.match.update({
      data: {
        lifecycle: MatchLifecycle.IN_PROGRESS,
        status: MatchStatus.ROUND_1_RUNNING,
      },
      where: { id: creation.match.id },
    });
    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/matches/${creation.match.id}`,
      ),
    )
      .send({
        athletes: [
          { athleteId: red.id, color: AthleteColor.RED },
          { athleteId: blue.id, color: AthleteColor.BLUE },
        ],
      })
      .expect(409)
      .expect({
        code: 'MATCH_ATHLETE_REPLACEMENT_UNSAFE',
        message: 'Athletes can only be replaced before match activity begins',
      });
    expect(
      await prisma.matchAthlete.findMany({
        orderBy: { color: 'asc' },
        where: { matchId: creation.match.id },
      }),
    ).toEqual(before);
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
    const weightClass = await createWeightClass(
      tournament.id,
      'rollback-weight',
    );
    const [red, blue] = await Promise.all([
      createAthlete(tournament.id, 'rollback-red', weightClass.id),
      createAthlete(tournament.id, 'rollback-blue', weightClass.id),
    ]);
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
            { color: AthleteColor.RED, athleteId: red.id },
            { color: AthleteColor.BLUE, athleteId: blue.id },
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
        where: { athleteId: { in: [red.id, blue.id] } },
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
