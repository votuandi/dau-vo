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
        organization: 'Private Dojo',
      })
      .expect(201);
    expect(created.body.role).toBe(UserRole.USER);
    const id = created.body.id as string;
    await root
      .patch(`/api/super-admin/users/${id}`)
      .send({ fullName: 'Changed Managed User', organization: 'Changed Dojo' })
      .expect(200);
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
    const audits = await prisma.auditLog.findMany({
      where: { adminUserId: superAdmin.id, eventType: 'ADMIN_ACTION' },
      orderBy: { createdAt: 'desc' },
    });
    const audit = audits.find(
      ({ metadata }) =>
        (metadata as { action?: string; targetUserId?: string }).action ===
          'SUPER_ADMIN_USER_RESTORED' &&
        (metadata as { targetUserId?: string }).targetUserId === id,
    );
    expect(audit).toBeDefined();
    const serialized = JSON.stringify(audit?.metadata);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(`${prefix}managed@example.test`);
    expect(serialized).not.toContain('0900000002');
    expect(serialized).not.toContain('Changed Managed User');
    expect(serialized).not.toContain('Changed Dojo');
    expect(serialized).not.toContain('Private Dojo');
    expect(serialized).not.toContain('undefined');
    const updateAudit = audits.find(
      ({ metadata }) =>
        (metadata as { action?: string; targetUserId?: string }).action ===
          'SUPER_ADMIN_USER_UPDATED' &&
        (metadata as { targetUserId?: string }).targetUserId === id,
    );
    expect(updateAudit?.metadata).toMatchObject({
      after: { changedFields: ['fullName', 'organization'] },
    });
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

  it('restores only soft-deleted users, preserves their state, and audits only successful restores', async () => {
    const root = request.agent(app.getHttpServer());
    await root
      .post('/api/auth/login')
      .send({ username: superAdmin.username, password })
      .expect(200);

    const createUser = (suffix: string, initialAdminAccess?: object) =>
      root.post('/api/super-admin/users').send({
        username: `${prefix}restore-${suffix}`,
        password,
        fullName: `Restore ${suffix}`,
        email: `${prefix}restore-${suffix}@example.test`,
        phone: `09000000${suffix === 'user' ? '21' : suffix === 'admin' ? '22' : suffix === 'active' ? '23' : '24'}`,
        ...(initialAdminAccess ? { initialAdminAccess } : {}),
      });

    const user = await createUser('user').expect(201);
    const admin = await createUser('admin', {
      activeFrom: '2030-01-01T00:00:00.000Z',
      activeUntil: '2030-12-31T00:00:00.000Z',
      tournamentLimit: 3,
    }).expect(201);
    const active = await createUser('active').expect(201);
    const inactive = await createUser('inactive').expect(201);
    const userId = user.body.id as string;
    const adminId = admin.body.id as string;
    const activeId = active.body.id as string;
    const inactiveId = inactive.body.id as string;

    await root
      .patch(`/api/super-admin/users/${inactiveId}`)
      .send({ isActive: false })
      .expect(200);
    await root.delete(`/api/super-admin/users/${userId}`).expect(200);
    await root.delete(`/api/super-admin/users/${adminId}`).expect(200);

    const beforeUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const beforeAdmin = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    const restoreAuditCountBefore = await prisma.auditLog.count({
      where: {
        adminUserId: superAdmin.id,
        eventType: 'ADMIN_ACTION',
        metadata: { path: ['action'], equals: 'SUPER_ADMIN_USER_RESTORED' },
      },
    });
    await root.post(`/api/super-admin/users/${userId}/restore`).expect(201);
    await root.post(`/api/super-admin/users/${adminId}/restore`).expect(201);
    await root
      .post(`/api/super-admin/users/${activeId}/restore`)
      .expect(409)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('USER_NOT_DELETED'),
      );
    await root
      .post(`/api/super-admin/users/${inactiveId}/restore`)
      .expect(409)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('USER_NOT_DELETED'),
      );
    await root
      .post(
        '/api/super-admin/users/00000000-0000-0000-0000-000000000000/restore',
      )
      .expect(404)
      .expect(({ body }: { body: { code: string } }) =>
        expect(body.code).toBe('USER_NOT_FOUND'),
      );

    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    ).resolves.toMatchObject({
      id: beforeUser.id,
      role: UserRole.USER,
      isActive: false,
      deletedAt: null,
      fullName: beforeUser.fullName,
      email: beforeUser.email,
      phone: beforeUser.phone,
      organization: beforeUser.organization,
    });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: adminId } }),
    ).resolves.toMatchObject({
      id: beforeAdmin.id,
      role: UserRole.ADMIN,
      isActive: false,
      deletedAt: null,
      fullName: beforeAdmin.fullName,
      email: beforeAdmin.email,
      phone: beforeAdmin.phone,
      organization: beforeAdmin.organization,
    });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: activeId } }),
    ).resolves.toMatchObject({
      id: activeId,
      isActive: true,
      deletedAt: null,
    });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: inactiveId } }),
    ).resolves.toMatchObject({
      id: inactiveId,
      isActive: false,
      deletedAt: null,
    });
    const restoreAudits = await prisma.auditLog.findMany({
      where: {
        adminUserId: superAdmin.id,
        eventType: 'ADMIN_ACTION',
        metadata: { path: ['action'], equals: 'SUPER_ADMIN_USER_RESTORED' },
      },
    });
    expect(restoreAudits).toHaveLength(restoreAuditCountBefore + 2);
    expect(
      restoreAudits.filter(
        ({ metadata }) =>
          (metadata as { targetUserId?: string }).targetUserId === userId,
      ),
    ).toHaveLength(1);
    expect(
      restoreAudits.filter(
        ({ metadata }) =>
          (metadata as { targetUserId?: string }).targetUserId === adminId,
      ),
    ).toHaveLength(1);
    expect(
      restoreAudits.filter(
        ({ metadata }) =>
          (metadata as { targetUserId?: string }).targetUserId === activeId,
      ),
    ).toHaveLength(0);
    expect(
      restoreAudits.filter(
        ({ metadata }) =>
          (metadata as { targetUserId?: string }).targetUserId === inactiveId,
      ),
    ).toHaveLength(0);
    expect(restoreAudits.map(({ metadata }) => metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetUserId: userId,
          before: expect.objectContaining({ deletedAt: expect.any(String) }),
          after: expect.objectContaining({ deletedAt: null, isActive: false }),
        }),
        expect.objectContaining({
          targetUserId: adminId,
          before: expect.objectContaining({ deletedAt: expect.any(String) }),
          after: expect.objectContaining({ deletedAt: null, isActive: false }),
        }),
      ]),
    );
  });

  it('rejects over-byte-limit managed-user passwords without creating a user', async () => {
    const root = request.agent(app.getHttpServer());
    const username = `${prefix}password-policy`;
    await root
      .post('/api/auth/login')
      .send({ username: superAdmin.username, password })
      .expect(200);
    await root
      .post('/api/super-admin/users')
      .send({
        username,
        password: '😀'.repeat(19),
        fullName: 'Password Policy',
        email: `${prefix}password-policy@example.test`,
        phone: '0900000019',
      })
      .expect(400)
      .expect({
        code: 'PASSWORD_TOO_LONG',
        message: 'Password must not exceed 72 UTF-8 bytes',
      });
    await expect(prisma.user.count({ where: { username } })).resolves.toBe(0);
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
    const accessAudit = async (
      status: AdminEntitlementStatus,
      role: UserRole,
    ) => {
      const audits = await prisma.auditLog.findMany({
        where: { adminUserId: superAdmin.id, eventType: 'ADMIN_ACTION' },
        orderBy: { createdAt: 'desc' },
      });
      const audit = audits.find(({ metadata }) => {
        const value = metadata as {
          action?: string;
          targetUserId?: string;
        };
        return (
          value.action === 'SUPER_ADMIN_ADMIN_ACCESS_CHANGED' &&
          value.targetUserId === id
        );
      });
      expect(audit).toBeDefined();
      const metadata = audit?.metadata as {
        before: Record<string, unknown>;
        after: Record<string, unknown>;
      };
      expect(metadata.after).toMatchObject({
        userId: id,
        role,
        isActive: true,
        deletedAt: null,
        entitlement: {
          status,
          activeFrom: expect.any(String),
          activeUntil: expect.any(String),
          tournamentLimit: 4,
        },
      });
      expect(Object.keys(metadata.before).sort()).toEqual(
        Object.keys(metadata.after).sort(),
      );
      expect(JSON.stringify(metadata)).not.toContain('undefined');
    };
    const activate = (action: 'ACTIVATE' | 'ADJUST') =>
      root.post(`/api/super-admin/users/${id}/admin-access`).send({
        action,
        activeFrom: '2030-01-01T00:00:00.000Z',
        activeUntil: '2030-12-31T00:00:00.000Z',
        tournamentLimit: 4,
      });

    await activate('ACTIVATE').expect(201);
    await accessAudit(AdminEntitlementStatus.ACTIVE, UserRole.ADMIN);
    await activate('ADJUST').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await accessAudit(AdminEntitlementStatus.ACTIVE, UserRole.ADMIN);
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({ action: 'SUSPEND' })
      .expect(201);
    await accessAudit(AdminEntitlementStatus.SUSPENDED, UserRole.ADMIN);
    await activate('ACTIVATE').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await accessAudit(AdminEntitlementStatus.ACTIVE, UserRole.ADMIN);
    await prisma.adminEntitlement.update({
      where: { userId: id },
      data: { status: AdminEntitlementStatus.EXPIRED },
    });
    await activate('ACTIVATE').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await accessAudit(AdminEntitlementStatus.ACTIVE, UserRole.ADMIN);
    await root
      .post(`/api/super-admin/users/${id}/admin-access`)
      .send({ action: 'REVOKE' })
      .expect(201);
    await accessAudit(AdminEntitlementStatus.REVOKED, UserRole.USER);
    await prisma.user
      .findUniqueOrThrow({ where: { id } })
      .then((user) => expect(user.role).toBe(UserRole.USER));
    await activate('ACTIVATE').expect(
      ({ body }: { body: { entitlement: { status: string } } }) =>
        expect(body.entitlement.status).toBe('ACTIVE'),
    );
    await accessAudit(AdminEntitlementStatus.ACTIVE, UserRole.ADMIN);
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
