import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminEntitlementStatus, UserRole } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import Redis from 'ioredis';
import request from 'supertest';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';

const prefix = 'super-admin-e2e-';
const password = 'Aa1!'.repeat(18);
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://martial_arts:martial_arts@localhost:5432/martial_arts_scoring?schema=public';
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/14';

describe('Super-admin management (e2e)', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let superAdmin: { id: string; username: string };

  beforeAll(async () => {
    Object.assign(process.env, {
      ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: '50',
      ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
      ADMIN_SESSION_SECRET:
        'super-admin-e2e-session-secret-with-at-least-thirty-two-characters',
      ADMIN_SESSION_TTL_SECONDS: '3600',
      API_PORT: '3001',
      BREAK_DURATION_MS: '60000',
      DATABASE_URL: databaseUrl,
      MATCH_SESSION_SECRET:
        'super-admin-e2e-match-secret-with-at-least-thirty-two-characters',
      NODE_ENV: 'test',
      REDIS_URL: redisUrl,
      ROUND_DURATION_MS: '120000',
      WEB_ORIGIN: 'http://localhost:5173',
    });
    const [{ AppModule }, { configureApplication }] = await Promise.all([
      import('../app.module'),
      import('../configure-application'),
    ]);
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
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
    superAdmin = await prisma.user.upsert({
      where: { normalizedUsername: `${prefix}root` },
      create: {
        username: `${prefix}root`,
        normalizedUsername: `${prefix}root`,
        passwordHash: await hash(password, 10),
        role: UserRole.SUPER_ADMIN,
      },
      update: {
        passwordHash: await hash(password, 10),
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, username: true },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { username: { startsWith: prefix } },
      });
    }
    if (redis) {
      await redis.flushdb();
      await redis.quit();
    }
    if (app) await app.close();
  });

  it('enforces role, completes user state transitions, and redacts its audit record', async () => {
    const root = request.agent(app.getHttpServer());
    const regular = request.agent(app.getHttpServer());
    await root
      .post('/api/auth/login')
      .send({ username: superAdmin.username, password })
      .expect(200);
    await regular
      .post('/api/auth/register')
      .send({
        username: `${prefix}regular`,
        password,
        fullName: 'Regular user',
        email: `${prefix}regular@example.test`,
        phone: '0900000001',
      })
      .expect(201);
    await regular.get('/api/super-admin/users').expect(403);

    const created = await root
      .post('/api/super-admin/users')
      .send({
        username: `${prefix}managed`,
        password,
        fullName: 'Managed User',
        email: `${prefix}managed@example.test`,
        phone: '0900000002',
      })
      .expect(201);
    expect(created.body.role).toBe(UserRole.USER);
    const id = created.body.id as string;
    await root
      .get('/api/super-admin/users?page=1&pageSize=1&role=USER')
      .expect(200)
      .expect(
        ({
          body,
        }: {
          body: { page: number; pageSize: number; items: unknown[] };
        }) => {
          expect(body).toMatchObject({ page: 1, pageSize: 1 });
          expect(body.items).toHaveLength(1);
        },
      );
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({
        action: 'ACTIVATE',
        activeFrom: '2030-01-01T00:00:00.000Z',
        activeUntil: '2030-12-31T00:00:00.000Z',
        tournamentLimit: 3,
      })
      .expect(201)
      .expect(
        ({
          body,
        }: {
          body: { user: { role: string }; entitlement: { status: string } };
        }) => {
          expect(body.user.role).toBe(UserRole.ADMIN);
          expect(body.entitlement.status).toBe('ACTIVE');
        },
      );
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({ action: 'SUSPEND' })
      .expect(201);
    await root.delete(`/api/super-admin/users/${id}`).expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: `${prefix}managed`, password })
      .expect(401);
    await root.post(`/api/super-admin/users/${id}/restore`).expect(201);
    const audit = await prisma.auditLog.findFirst({
      where: { adminUserId: superAdmin.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit?.metadata)).not.toContain(password);
    expect(JSON.stringify(audit?.metadata)).not.toContain(
      `${prefix}managed@example.test`,
    );
    expect(JSON.stringify(audit?.metadata)).not.toContain('0900000002');
  });

  it('creates ADMIN users atomically with their initial entitlement', async () => {
    const root = request.agent(app.getHttpServer());
    await root
      .post('/api/auth/login')
      .send({ username: superAdmin.username, password })
      .expect(200);

    const admin = await root
      .post('/api/super-admin/users')
      .send({
        username: `${prefix}initial-admin`,
        password,
        fullName: 'Initial Admin',
        email: `${prefix}initial-admin@example.test`,
        phone: '0900000011',
        initialAdminAccess: {
          activeFrom: '2030-01-01T00:00:00.000Z',
          activeUntil: '2030-12-31T00:00:00.000Z',
          tournamentLimit: 3,
        },
      })
      .expect(201);
    expect(admin.body.role).toBe(UserRole.ADMIN);
    expect(admin.body.adminEntitlement).toMatchObject({
      status: AdminEntitlementStatus.ACTIVE,
      tournamentLimit: 3,
    });

    await root
      .post('/api/super-admin/users')
      .send({
        username: `${prefix}invalid-dates`,
        password,
        fullName: 'Invalid Dates',
        email: `${prefix}invalid-dates@example.test`,
        phone: '0900000012',
        initialAdminAccess: {
          activeFrom: '2030-12-31T00:00:00.000Z',
          activeUntil: '2030-01-01T00:00:00.000Z',
          tournamentLimit: 1,
        },
      })
      .expect(400);
    await root
      .post('/api/super-admin/users')
      .send({
        username: `${prefix}invalid-limit`,
        password,
        fullName: 'Invalid Limit',
        email: `${prefix}invalid-limit@example.test`,
        phone: '0900000013',
        initialAdminAccess: {
          activeUntil: '2030-12-31T00:00:00.000Z',
          tournamentLimit: -1,
        },
      })
      .expect(400);
    await expect(
      prisma.user.count({
        where: {
          username: {
            in: [`${prefix}invalid-dates`, `${prefix}invalid-limit`],
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it('rejects arbitrary roles and duplicate identities without partial users', async () => {
    const root = request.agent(app.getHttpServer());
    await root
      .post('/api/auth/login')
      .send({ username: superAdmin.username, password })
      .expect(200);
    const base = {
      username: `${prefix}duplicate`,
      password,
      fullName: 'Duplicate Source',
      email: `${prefix}duplicate@example.test`,
      phone: '0900000014',
    };
    await root.post('/api/super-admin/users').send(base).expect(201);
    for (const [code, duplicate] of [
      [
        'USERNAME_ALREADY_EXISTS',
        {
          ...base,
          email: `${prefix}unique-a@example.test`,
          phone: '0900000015',
        },
      ],
      [
        'EMAIL_ALREADY_EXISTS',
        { ...base, username: `${prefix}unique-b`, phone: '0900000016' },
      ],
      [
        'PHONE_ALREADY_EXISTS',
        {
          ...base,
          username: `${prefix}unique-c`,
          email: `${prefix}unique-c@example.test`,
        },
      ],
    ] as const) {
      await root
        .post('/api/super-admin/users')
        .send(duplicate)
        .expect(409)
        .expect(({ body }: { body: { code: string } }) =>
          expect(body.code).toBe(code),
        );
    }
    await root
      .post('/api/super-admin/users')
      .send({
        ...base,
        username: `${prefix}role`,
        email: `${prefix}role@example.test`,
        phone: '0900000017',
        role: 'SUPER_ADMIN',
      })
      .expect(400);
    await expect(
      prisma.user.count({
        where: { username: { startsWith: `${prefix}unique-` } },
      }),
    ).resolves.toBe(0);
  });

  it('supports every entitlement transition and protects super admins and deleted users', async () => {
    const root = request.agent(app.getHttpServer());
    await root
      .post('/api/auth/login')
      .send({ username: superAdmin.username, password })
      .expect(200);
    const created = await root
      .post('/api/super-admin/users')
      .send({
        username: `${prefix}transitions`,
        password,
        fullName: 'Transition User',
        email: `${prefix}transitions@example.test`,
        phone: '0900000003',
      })
      .expect(201);
    const id = created.body.id as string;
    const activate = (action: 'ACTIVATE' | 'ADJUST') =>
      root.post(`/api/super-admin/users/${id}/admin-access`).send({
        action,
        activeFrom: '2030-01-01T00:00:00.000Z',
        activeUntil: '2030-12-31T00:00:00.000Z',
        tournamentLimit: 4,
      });

    await activate('ACTIVATE').expect(201);
    await activate('ADJUST').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({ action: 'SUSPEND' })
      .expect(201);
    await activate('ACTIVATE').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await prisma.adminEntitlement.update({
      where: { userId: id },
      data: { status: AdminEntitlementStatus.EXPIRED },
    });
    await activate('ACTIVATE').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({ action: 'REVOKE' })
      .expect(201);
    await prisma.user
      .findUniqueOrThrow({ where: { id } })
      .then((user) => expect(user.role).toBe(UserRole.USER));
    await activate('ACTIVATE').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await root
      .post(`/api/super-admin/users/${superAdmin.id}/admin-access`)
      .send({ action: 'ADJUST' })
      .expect(403);
    await root.delete(`/api/super-admin/users/${id}`).expect(200);
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({ action: 'SUSPEND' })
      .expect(409);
  });
});
