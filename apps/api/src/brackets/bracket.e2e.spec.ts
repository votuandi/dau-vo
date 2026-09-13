import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AdminEntitlementStatus, AuditEventType } from '@prisma/client';
import { hash } from 'bcryptjs';
import Redis from 'ioredis';
import request, { type Test as SupertestRequest } from 'supertest';

import { DEFAULT_SPORT } from '../../prisma/default-sport';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/14';
const runId = `${process.pid}-${Date.now().toString(36)}`;
const prefix = `bracket-e2e-${runId}`;
const username = `${prefix}-admin`;
const password = 'Aa1!'.repeat(15);

interface TournamentResponse {
  tournament: { id: string };
}

interface WeightClassResponse {
  weightClass: { id: string };
}

interface AthleteResponse {
  athlete: { id: string };
}

interface PreviewResponse {
  previewToken: string;
  initialEntrants: Array<{ athlete: { id: string } | null }>;
}

function configureEnvironment(): void {
  Object.assign(process.env, {
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '10',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    ADMIN_SESSION_SECRET:
      'bracket-e2e-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3004',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: databaseUrl,
    MATCH_PUBLIC_ID_INITIAL_LENGTH: '6',
    MATCH_SESSION_SECRET:
      'bracket-e2e-match-secret-with-at-least-thirty-two-characters',
    NODE_ENV: 'test',
    REDIS_URL: redisUrl,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

function cookie(headers: Record<string, unknown>): string {
  const value = headers['set-cookie'];
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') throw new Error('Login did not set a cookie');
  return first.split(';')[0]!;
}

describe('Bracket confirmation (PostgreSQL integration)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let adminCookie: string;
  let adminId: string;

  const authenticated = (testRequest: SupertestRequest): SupertestRequest =>
    testRequest.set('Cookie', adminCookie);

  async function createTournament(): Promise<string> {
    const response = await authenticated(
      request(app.getHttpServer()).post('/api/admin/tournaments'),
    )
      .send({ name: `${prefix}-tournament`, sportId: DEFAULT_SPORT.id })
      .expect(201);
    return (response.body as TournamentResponse).tournament.id;
  }

  async function createWeightClass(
    tournamentId: string,
    label = 'weight',
  ): Promise<string> {
    const response = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/weight-classes`,
      ),
    )
      .send({ name: `${prefix}-${label}` })
      .expect(201);
    return (response.body as WeightClassResponse).weightClass.id;
  }

  async function createAthletes(
    tournamentId: string,
    weightClassId: string,
    count: number,
  ): Promise<string[]> {
    return Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const response = await authenticated(
          request(app.getHttpServer()).post(
            `/api/admin/tournaments/${tournamentId}/athletes`,
          ),
        )
          .send({
            birthYear: 2000 + index,
            name: `${prefix}-athlete-${index}`,
            weightClassId,
          })
          .expect(201);
        return (response.body as AthleteResponse).athlete.id;
      }),
    );
  }

  async function preview(tournamentId: string, weightClassId: string) {
    const drawSetup = await authenticated(
      request(app.getHttpServer()).get(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/draw-setup`,
      ),
    ).expect(200);
    return authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/preview`,
      ),
    )
      .send({
        setupToken: (drawSetup.body as { setupToken: string }).setupToken,
        designatedByeAthleteIds: [],
      })
      .expect(201);
  }

  async function setup(count = 3) {
    const tournamentId = await createTournament();
    const weightClassId = await createWeightClass(tournamentId);
    const athleteIds = await createAthletes(tournamentId, weightClassId, count);
    return { athleteIds, tournamentId, weightClassId };
  }

  beforeAll(async () => {
    configureEnvironment();
    const [{ AppModule }, { configureApplication }] = await Promise.all([
      import('../app.module'),
      import('../configure-application'),
    ]);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApplication(
      app,
      app.get(ConfigService<EnvironmentVariables, true>),
    );
    await app.init();
    prisma = app.get(PrismaService);
    redis = new Redis(redisUrl, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    await redis.ping();
    await redis.flushdb();
    const admin = await prisma.user.create({
      data: {
        adminEntitlement: {
          create: {
            activeFrom: new Date(Date.now() - 60_000),
            activeUntil: new Date(Date.now() + 86_400_000),
            status: AdminEntitlementStatus.ACTIVE,
            tournamentLimit: 100,
          },
        },
        normalizedUsername: username,
        passwordHash: await hash(password, 10),
        username,
      },
    });
    adminId = admin.id;
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password, username })
      .expect(200);
    adminCookie = cookie(login.headers);
  });

  afterAll(async () => {
    if (prisma) {
      const tournaments = await prisma.tournament.findMany({
        select: { id: true },
        where: { name: { startsWith: prefix } },
      });
      const ids = tournaments.map(({ id }) => id);
      if (ids.length) {
        await prisma.match.deleteMany({ where: { tournamentId: { in: ids } } });
        const brackets = await prisma.tournamentBracket.findMany({
          select: { id: true },
          where: { tournamentId: { in: ids } },
        });
        const bracketIds = brackets.map(({ id }) => id);
        if (bracketIds.length) {
          await prisma.bracketSlot.deleteMany({
            where: { fixture: { bracketId: { in: bracketIds } } },
          });
          await prisma.bracketFixture.deleteMany({
            where: { bracketId: { in: bracketIds } },
          });
          await prisma.bracketEntrant.deleteMany({
            where: { bracketId: { in: bracketIds } },
          });
          await prisma.tournamentBracket.deleteMany({
            where: { id: { in: bracketIds } },
          });
        }
        await prisma.tournament.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
    if (redis) await redis.quit();
    if (app) await app.close();
  });

  it('authorizes preview, returns no-store, includes the eligible roster, and persists nothing', async () => {
    const { athleteIds, tournamentId, weightClassId } = await setup();
    await request(app.getHttpServer())
      .post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/preview`,
      )
      .expect(401);

    const response = await preview(tournamentId, weightClassId);
    expect(response.headers['cache-control']).toContain('no-store');
    const body = response.body as PreviewResponse;
    expect(
      body.initialEntrants
        .flatMap(({ athlete }) => (athlete ? [athlete.id] : []))
        .sort(),
    ).toEqual(athleteIds.sort());
    await expect(
      prisma.tournamentBracket.count({ where: { tournamentId } }),
    ).resolves.toBe(0);
    await expect(prisma.match.count({ where: { tournamentId } })).resolves.toBe(
      0,
    );
    await expect(prisma.matchAccessCode.count()).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          adminUserId: adminId,
          eventType: AuditEventType.BRACKET_CONFIRMED,
        },
      }),
    ).resolves.toBe(0);
  });

  it('persists the immutable graph but no operational match, credentials, or prepare audit', async () => {
    const { athleteIds, tournamentId, weightClassId } = await setup();
    const previewBody = (await preview(tournamentId, weightClassId))
      .body as PreviewResponse;
    const confirmation = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/confirm`,
      ),
    )
      .send({
        idempotencyKey: `${prefix}-confirm`,
        previewToken: previewBody.previewToken,
      })
      .expect(201);
    const bracketId = (confirmation.body as { bracket: { id: string } }).bracket
      .id;
    const persisted = await prisma.tournamentBracket.findUniqueOrThrow({
      where: { id: bracketId },
      include: { entrants: true, fixtures: { include: { slots: true } } },
    });
    expect(persisted.entrants.map(({ athleteId }) => athleteId).sort()).toEqual(
      athleteIds.sort(),
    );
    expect(persisted.fixtures).toHaveLength(athleteIds.length - 1);
    expect(persisted.fixtures.every(({ slots }) => slots.length === 2)).toBe(
      true,
    );
    expect(
      persisted.entrants.every(({ snapshotName }) =>
        snapshotName.startsWith(prefix),
      ),
    ).toBe(true);
    await expect(prisma.match.count({ where: { tournamentId } })).resolves.toBe(
      0,
    );
    await expect(prisma.matchAccessCode.count()).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: { eventType: AuditEventType.BRACKET_MATCH_PREPARED },
      }),
    ).resolves.toBe(0);
  });

  it('rejects a roster changed after preview without partial writes', async () => {
    const { athleteIds, tournamentId, weightClassId } = await setup();
    const previewBody = (await preview(tournamentId, weightClassId))
      .body as PreviewResponse;
    await prisma.tournamentAthlete.update({
      data: { isActive: false, deactivatedAt: new Date() },
      where: { id: athleteIds[0]! },
    });
    await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/confirm`,
      ),
    )
      .send({
        idempotencyKey: `${prefix}-stale`,
        previewToken: previewBody.previewToken,
      })
      .expect(409)
      .expect({
        code: 'BRACKET_ROSTER_CHANGED',
        message: 'The eligible roster changed after preview',
      });
    await expect(
      prisma.tournamentBracket.count({ where: { tournamentId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.bracketEntrant.count({ where: { bracket: { tournamentId } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.bracketFixture.count({ where: { bracket: { tournamentId } } }),
    ).resolves.toBe(0);
  });

  it('replays an identical confirmation key and rejects a semantically different retry', async () => {
    const { tournamentId, weightClassId } = await setup(4);
    const firstPreview = (await preview(tournamentId, weightClassId))
      .body as PreviewResponse;
    const endpoint = `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket/confirm`;
    const first = await authenticated(
      request(app.getHttpServer()).post(endpoint),
    )
      .send({
        idempotencyKey: `${prefix}-replay`,
        previewToken: firstPreview.previewToken,
      })
      .expect(201);
    const replay = await authenticated(
      request(app.getHttpServer()).post(endpoint),
    )
      .send({
        idempotencyKey: `${prefix}-replay`,
        previewToken: firstPreview.previewToken,
      })
      .expect(201);
    expect(replay.body).toEqual(first.body);
    const anotherWeightClassId = await createWeightClass(
      tournamentId,
      'another-weight',
    );
    await createAthletes(tournamentId, anotherWeightClassId, 2);
    const alteredPreview = (await preview(tournamentId, anotherWeightClassId))
      .body as PreviewResponse;
    await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/weight-classes/${anotherWeightClassId}/bracket/confirm`,
      ),
    )
      .send({
        idempotencyKey: `${prefix}-replay`,
        previewToken: alteredPreview.previewToken,
      })
      .expect(409)
      .expect({
        code: 'BRACKET_CONFIRMATION_KEY_REUSED',
        message: 'Idempotency key was used for a different confirmation',
      });
    await expect(
      prisma.tournamentBracket.count({ where: { tournamentId } }),
    ).resolves.toBe(1);
  });

  it('locks roster additions and moves while preserving profile edits, then unlocks on cancellation', async () => {
    const { athleteIds, tournamentId, weightClassId } = await setup(2);
    const otherWeightClassId = await createWeightClass(
      tournamentId,
      'unlocked',
    );
    const [outsideAthleteId] = await createAthletes(
      tournamentId,
      otherWeightClassId,
      1,
    );
    const previewBody = (await preview(tournamentId, weightClassId))
      .body as PreviewResponse;
    const bracketPath = `/api/admin/tournaments/${tournamentId}/weight-classes/${weightClassId}/bracket`;
    await authenticated(
      request(app.getHttpServer()).post(`${bracketPath}/confirm`),
    )
      .send({
        idempotencyKey: `${prefix}-roster-lock`,
        previewToken: previewBody.previewToken,
      })
      .expect(201);

    const blockedCreate = await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/athletes`,
      ),
    )
      .send({ birthYear: 2000, name: `${prefix}-blocked`, weightClassId })
      .expect(409);
    expect(blockedCreate.body).toEqual(
      expect.objectContaining({ code: 'WEIGHT_CLASS_BRACKET_LOCKED' }),
    );
    const blockedMove = await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournamentId}/athletes/${outsideAthleteId}`,
      ),
    )
      .send({ weightClassId })
      .expect(409);
    expect(blockedMove.body).toEqual(
      expect.objectContaining({ code: 'WEIGHT_CLASS_BRACKET_LOCKED' }),
    );
    await authenticated(
      request(app.getHttpServer()).patch(
        `/api/admin/tournaments/${tournamentId}/athletes/${athleteIds[0]}`,
      ),
    )
      .send({ name: `${prefix}-renamed` })
      .expect(200);

    await authenticated(
      request(app.getHttpServer()).post(`${bracketPath}/cancel`),
    )
      .send({ reason: 'Correcting roster' })
      .expect(201);
    await authenticated(
      request(app.getHttpServer()).post(
        `/api/admin/tournaments/${tournamentId}/athletes`,
      ),
    )
      .send({ birthYear: 2000, name: `${prefix}-allowed`, weightClassId })
      .expect(201);
  });
});
