import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import Redis from 'ioredis';
import request from 'supertest';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const redisUrl = 'redis://localhost:6379/15';
const password = 'Aa1!'.repeat(18);
const usernames = [
  'subscription-super-admin-e2e',
  'subscription-user-e2e',
] as const;

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '3',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    ADMIN_SESSION_SECRET:
      'subscriptions-e2e-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3001',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: databaseUrl,
    MATCH_SESSION_SECRET:
      'subscriptions-e2e-match-secret-with-at-least-thirty-two-characters',
    NODE_ENV: 'test',
    REDIS_URL: redisUrl,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

describe('Subscriptions (integration)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let superAdminId: string;
  let userId: string;

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
    redis = new Redis(redisUrl, {
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
    });
    await redis.flushdb();

    const passwordHash = await hash(password, 10);
    const superAdmin = await prisma.user.upsert({
      create: {
        normalizedUsername: usernames[0],
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        username: usernames[0],
      },
      update: { passwordHash, role: UserRole.SUPER_ADMIN },
      where: { normalizedUsername: usernames[0] },
    });
    const user = await prisma.user.upsert({
      create: {
        normalizedUsername: usernames[1],
        passwordHash,
        role: UserRole.USER,
        username: usernames[1],
      },
      update: { passwordHash, role: UserRole.USER },
      where: { normalizedUsername: usernames[1] },
    });
    superAdminId = superAdmin.id;
    userId = user.id;
  });

  beforeEach(async () => {
    await redis.flushdb();
    await prisma.subscriptionOrder.deleteMany({
      where: { userId: { in: [superAdminId, userId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { adminUserId: { in: [superAdminId, userId] } },
    });
    await prisma.adminEntitlement.deleteMany({
      where: { userId: { in: [superAdminId, userId] } },
    });
    await prisma.user.update({
      where: { id: superAdminId },
      data: { role: UserRole.SUPER_ADMIN },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.USER },
    });
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.subscriptionOrder.deleteMany({
        where: { userId: { in: [superAdminId, userId] } },
      });
      await prisma.auditLog.deleteMany({
        where: { adminUserId: { in: [superAdminId, userId] } },
      });
      await prisma.adminEntitlement.deleteMany({
        where: { userId: { in: [superAdminId, userId] } },
      });
      await prisma.user.deleteMany({
        where: { username: { in: [...usernames] } },
      });
    }
    if (redis !== undefined) {
      await redis.flushdb();
      await redis.quit();
    }
    if (app !== undefined) await app.close();
  });

  async function login(username: string) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .send({ password, username })
      .expect(200);
    return agent;
  }

  it('rejects SUPER_ADMIN activation without changing any subscription data', async () => {
    const existingEntitlement = await prisma.adminEntitlement.create({
      data: {
        activeFrom: new Date(),
        activeUntil: new Date(Date.now() + 86_400_000),
        status: 'ACTIVE',
        tournamentLimit: 99,
        userId: superAdminId,
      },
    });
    const agent = await login(usernames[0]);

    await agent
      .post('/api/subscriptions/activate')
      .send({ idempotencyKey: 'super-admin-subscription' })
      .expect(403)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('SUPER_ADMIN_SUBSCRIPTION_NOT_ALLOWED'),
      );

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: superAdminId } }))
        .role,
    ).toBe(UserRole.SUPER_ADMIN);
    expect(
      await prisma.subscriptionOrder.count({ where: { userId: superAdminId } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { adminUserId: superAdminId } }),
    ).toBe(0);
    expect(
      await prisma.adminEntitlement.findUnique({
        where: { userId: superAdminId },
      }),
    ).toEqual(existingEntitlement);
  });

  it('allows a USER to activate and an ADMIN to renew', async () => {
    const agent = await login(usernames[1]);
    await agent
      .post('/api/subscriptions/activate')
      .send({ idempotencyKey: 'user-activate' })
      .expect(201);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).role,
    ).toBe(UserRole.ADMIN);
    const firstEntitlement = await prisma.adminEntitlement.findUniqueOrThrow({
      where: { userId },
    });

    await agent
      .post('/api/subscriptions/activate')
      .send({ idempotencyKey: 'admin-renew' })
      .expect(201);
    const renewedEntitlement = await prisma.adminEntitlement.findUniqueOrThrow({
      where: { userId },
    });
    expect(renewedEntitlement.activeUntil.getTime()).toBeGreaterThan(
      firstEntitlement.activeUntil.getTime(),
    );
    expect(await prisma.subscriptionOrder.count({ where: { userId } })).toBe(2);
  });
});
