import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import Redis from 'ioredis';
import request from 'supertest';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const TEST_REDIS_URL = 'redis://localhost:6379/15';
const TEST_ADMIN_USERNAME = 'admin-auth-e2e';
const TEST_ADMIN_PASSWORD = 'Aa1!'.repeat(18);

const invalidCredentialsResponse = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid username or password',
} as const;

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '3',
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    ADMIN_SESSION_SECRET:
      'admin-auth-e2e-session-secret-with-at-least-thirty-two-characters',
    ADMIN_SESSION_TTL_SECONDS: '3600',
    API_PORT: '3001',
    BREAK_DURATION_MS: '60000',
    DATABASE_URL: TEST_DATABASE_URL,
    MATCH_SESSION_SECRET:
      'match-auth-e2e-session-secret-with-at-least-thirty-two-characters',
    NODE_ENV: 'test',
    REDIS_URL: TEST_REDIS_URL,
    ROUND_DURATION_MS: '120000',
    WEB_ORIGIN: 'http://localhost:5173',
  });
}

describe('Admin authentication (integration)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let testAdmin: {
    id: string;
    username: string;
    fullName: string | null;
    role: UserRole;
    isActive: boolean;
  };

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

    const passwordHash = await hash(TEST_ADMIN_PASSWORD, 10);
    testAdmin = await prisma.user.upsert({
      create: {
        normalizedUsername: TEST_ADMIN_USERNAME,
        passwordHash,
        username: TEST_ADMIN_USERNAME,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
      update: { passwordHash },
      where: { normalizedUsername: TEST_ADMIN_USERNAME },
    });
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    if (prisma !== undefined) {
      await prisma.user.deleteMany({
        where: { username: TEST_ADMIN_USERNAME },
      });
    }

    if (redis !== undefined) {
      await redis.flushdb();
      await redis.quit();
    }

    if (app !== undefined) {
      await app.close();
    }
  });

  it('logs in with valid credentials and issues an HTTP-only cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        password: TEST_ADMIN_PASSWORD,
        username: TEST_ADMIN_USERNAME,
      })
      .expect(200);

    expect(response.body).toEqual({ user: testAdmin });

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    const cookieAttributes = Array.isArray(setCookie)
      ? setCookie.join('; ')
      : String(setCookie);
    expect(cookieAttributes).toContain('HttpOnly');
    expect(cookieAttributes).toContain('SameSite=Strict');
    expect(cookieAttributes).toContain('Path=/api');
  });

  it('returns the same standardized error for a bad username or password', async () => {
    const unknownUsernameResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        password: TEST_ADMIN_PASSWORD,
        username: `${TEST_ADMIN_USERNAME}-missing`,
      })
      .expect(401);

    const wrongPasswordResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        password: 'definitely-not-the-password',
        username: TEST_ADMIN_USERNAME,
      })
      .expect(401);

    expect(unknownUsernameResponse.body).toEqual(invalidCredentialsResponse);
    expect(wrongPasswordResponse.body).toEqual(invalidCredentialsResponse);
    expect(wrongPasswordResponse.body).toEqual(unknownUsernameResponse.body);
  });

  it('rejects a password that only matches after bcrypt truncation', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        password: `${TEST_ADMIN_PASSWORD}-ignored-by-bcrypt`,
        username: TEST_ADMIN_USERNAME,
      })
      .expect(401)
      .expect(invalidCredentialsResponse);
  });

  it('rate-limits repeated login attempts for the same identity', async () => {
    const attemptedCredentials = {
      password: 'not-the-password',
      username: `${TEST_ADMIN_USERNAME}-rate-limited`,
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(attemptedCredentials)
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(attemptedCredentials)
      .expect(429)
      .expect({
        code: 'LOGIN_RATE_LIMITED',
        message: 'Too many login attempts. Try again later.',
      });
  });

  it('rejects the protected session endpoint without a login cookie', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401).expect({
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    });
  });

  it('returns the authenticated admin for a valid session cookie', async () => {
    const authenticatedAgent = request.agent(app.getHttpServer());

    await authenticatedAgent
      .post('/api/auth/login')
      .send({
        password: TEST_ADMIN_PASSWORD,
        username: TEST_ADMIN_USERNAME,
      })
      .expect(200);

    await authenticatedAgent
      .get('/api/auth/me')
      .expect(200)
      .expect({ user: testAdmin });
  });

  it('revokes the server-side session on logout', async () => {
    const authenticatedAgent = request.agent(app.getHttpServer());

    await authenticatedAgent
      .post('/api/auth/login')
      .send({
        password: TEST_ADMIN_PASSWORD,
        username: TEST_ADMIN_USERNAME,
      })
      .expect(200);

    await authenticatedAgent.post('/api/auth/logout').expect(204);

    await authenticatedAgent.get('/api/auth/me').expect(401).expect({
      code: 'AUTH_REQUIRED',
      message: 'Authentication required',
    });
  });

  it('rejects an inactive or soft-deleted user even when a Redis session exists', async () => {
    const authenticatedAgent = request.agent(app.getHttpServer());
    await authenticatedAgent
      .post('/api/auth/login')
      .send({ password: TEST_ADMIN_PASSWORD, username: TEST_ADMIN_USERNAME })
      .expect(200);
    await prisma.user.update({
      where: { id: testAdmin.id },
      data: { isActive: false },
    });
    await authenticatedAgent.get('/api/auth/me').expect(401);
    await prisma.user.update({
      where: { id: testAdmin.id },
      data: { isActive: true, deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password: TEST_ADMIN_PASSWORD, username: TEST_ADMIN_USERNAME })
      .expect(401);
    await prisma.user.update({
      where: { id: testAdmin.id },
      data: { deletedAt: null },
    });
  });

  it('returns a changed role on the next authenticated request', async () => {
    const authenticatedAgent = request.agent(app.getHttpServer());
    await authenticatedAgent
      .post('/api/auth/login')
      .send({ password: TEST_ADMIN_PASSWORD, username: TEST_ADMIN_USERNAME })
      .expect(200);
    await prisma.user.update({
      where: { id: testAdmin.id },
      data: { role: 'SUPER_ADMIN' },
    });
    await authenticatedAgent
      .get('/api/auth/me')
      .expect(200)
      .expect(({ body }: { body: { user: { role: string } } }) =>
        expect(body.user.role).toBe('SUPER_ADMIN'),
      );
    await prisma.user.update({
      where: { id: testAdmin.id },
      data: { role: 'ADMIN' },
    });
  });
});
