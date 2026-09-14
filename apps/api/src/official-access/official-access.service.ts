import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TournamentStatus } from '@prisma/client';
import type {
  MatchStatus,
  Prisma,
  TournamentOfficialRole,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeSessionRegistryService } from '../realtime/realtime-session-registry.service';
import {
  INVALID_OFFICIAL_CREDENTIALS_ERROR,
  INVALID_OFFICIAL_TAKEOVER_ERROR,
  OFFICIAL_ACCESS_RATE_LIMITED_ERROR,
  OFFICIAL_SESSION_ALREADY_ACTIVE,
} from './official-access.constants';
import type { ValidatedOfficialSession } from './official-access.types';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BCRYPT_MAX_BYTES = 72;
const CHALLENGE_TTL_SECONDS = 120;
type Credentials = {
  tournamentId: string;
  officialId: string;
  passcodeHash: string;
  role: TournamentOfficialRole;
  tournamentCode: string;
};
type Challenge = {
  version: 1;
  observedSessionId: string;
  officialId: string;
  deviceId: string;
  expiresAt: number;
  nonce: string;
};
const sessionSelect = {
  id: true,
  deviceId: true,
  expiresAt: true,
  official: {
    select: {
      id: true,
      name: true,
      role: true,
      tournament: { select: { id: true, publicCode: true, name: true } },
      assignments: {
        where: { releasedAt: null },
        take: 1,
        select: {
          id: true,
          role: true,
          refereePosition: true,
          match: { select: { id: true, publicId: true, status: true } },
        },
      },
    },
  },
} satisfies Prisma.TournamentOfficialSessionSelect;
type SessionRow = Prisma.TournamentOfficialSessionGetPayload<{
  select: typeof sessionSelect;
}>;
type Acquisition =
  | { kind: 'conflict'; conflict: string }
  | {
      kind: 'created';
      session: ValidatedOfficialSession;
      sessionToken: string;
      revokedSessionId: string | null;
    };

@Injectable()
export class OfficialAccessService {
  private readonly dummyHash: Promise<string>;
  private readonly passcodeSecret: string;
  private readonly sessionSecret: string;
  private readonly ttl: number;
  private readonly identityLimit: number;
  private readonly ipLimit: number;
  private readonly window: number;
  constructor(
    @Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RealtimeSessionRegistryService)
    private readonly realtimeSessions: RealtimeSessionRegistryService,
  ) {
    this.passcodeSecret = config.getOrThrow('OFFICIAL_PASSCODE_SECRET', {
      infer: true,
    });
    this.sessionSecret = config.getOrThrow('OFFICIAL_SESSION_SECRET', {
      infer: true,
    });
    this.ttl = config.getOrThrow('OFFICIAL_SESSION_TTL_SECONDS', {
      infer: true,
    });
    this.identityLimit = config.getOrThrow(
      'OFFICIAL_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS',
      { infer: true },
    );
    this.ipLimit = config.getOrThrow(
      'OFFICIAL_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS',
      { infer: true },
    );
    this.window = config.getOrThrow(
      'OFFICIAL_ACCESS_RATE_LIMIT_WINDOW_SECONDS',
      { infer: true },
    );
    this.dummyHash = hash(randomBytes(TOKEN_BYTES).toString('base64url'), 12);
  }

  async login(
    tournamentCode: string,
    privatePasscode: string,
    deviceId: string,
    expectedRole: TournamentOfficialRole | undefined,
    clientIp: string,
  ) {
    const input = this.normalize(tournamentCode, privatePasscode, deviceId);
    await this.rateLimit(input, clientIp);
    const credential = await this.verify(
      input.code,
      input.passcode,
      expectedRole,
    );
    const result = await this.acquire(
      credential,
      input.passcode,
      input.deviceId,
      undefined,
    );
    if (result.kind === 'conflict')
      throw new HttpException(
        {
          ...OFFICIAL_SESSION_ALREADY_ACTIVE,
          takeoverToken: this.challenge(
            result.conflict,
            credential.officialId,
            input.deviceId,
          ),
        },
        HttpStatus.CONFLICT,
      );
    if (result.revokedSessionId)
      this.realtimeSessions.revokeSessions([result.revokedSessionId]);
    return result;
  }

  async takeover(
    tournamentCode: string,
    privatePasscode: string,
    deviceId: string,
    expectedRole: TournamentOfficialRole | undefined,
    takeoverToken: string,
    clientIp: string,
  ) {
    const input = this.normalize(tournamentCode, privatePasscode, deviceId);
    const challenge = this.verifyChallenge(takeoverToken);
    if (challenge.deviceId !== input.deviceId)
      throw new UnauthorizedException(INVALID_OFFICIAL_TAKEOVER_ERROR);
    await this.rateLimit(input, clientIp);
    const credential = await this.verify(
      input.code,
      input.passcode,
      expectedRole,
    );
    if (credential.officialId !== challenge.officialId)
      throw new UnauthorizedException(INVALID_OFFICIAL_TAKEOVER_ERROR);
    const result = await this.acquire(
      credential,
      input.passcode,
      input.deviceId,
      challenge.observedSessionId,
    );
    if (result.kind === 'conflict')
      throw new HttpException(
        {
          ...OFFICIAL_SESSION_ALREADY_ACTIVE,
          takeoverToken: this.challenge(
            result.conflict,
            credential.officialId,
            input.deviceId,
          ),
        },
        HttpStatus.CONFLICT,
      );
    if (result.revokedSessionId)
      this.realtimeSessions.revokeSessions([result.revokedSessionId]);
    return result;
  }

  async revokeSession(token: string): Promise<void> {
    if (!TOKEN_PATTERN.test(token)) return;
    const sessions = await this.prisma.tournamentOfficialSession.findMany({
      where: { tokenHash: this.tokenHash(token), active: true },
      select: { id: true },
    });
    await this.prisma.tournamentOfficialSession.updateMany({
      where: { id: { in: sessions.map((session) => session.id) } },
      data: { active: false, revokedAt: new Date() },
    });
    this.realtimeSessions.revokeSessions(sessions.map((session) => session.id));
  }

  async resolveSession(
    token: string,
  ): Promise<ValidatedOfficialSession | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const now = new Date();
    const row = await this.prisma.tournamentOfficialSession.findFirst({
      where: {
        tokenHash: this.tokenHash(token),
        active: true,
        revokedAt: null,
        expiresAt: { gt: now },
        official: {
          isActive: true,
          tournament: {
            softDeletedAt: null,
            status: { not: TournamentStatus.ARCHIVED },
          },
        },
      },
      select: sessionSelect,
    });
    if (
      !row ||
      !(
        await this.prisma.tournamentOfficialSession.updateMany({
          where: { id: row.id, active: true, revokedAt: null },
          data: { lastSeenAt: now },
        })
      ).count
    )
      return null;
    return this.present(row);
  }

  async assertRole(
    identity: ValidatedOfficialSession,
    role: TournamentOfficialRole,
  ): Promise<void> {
    const fresh = await this.resolveIdentity(identity.sessionId);
    if (!fresh || fresh.official.role !== role)
      throw new UnauthorizedException(INVALID_OFFICIAL_CREDENTIALS_ERROR);
  }
  async requireActiveAssignment(identity: ValidatedOfficialSession) {
    const fresh = await this.resolveIdentity(identity.sessionId);
    return fresh?.activeAssignment ?? null;
  }

  private async acquire(
    credential: Credentials,
    passcode: string,
    deviceId: string,
    observed: string | undefined,
  ): Promise<Acquisition> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttl * 1000);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM tournament_officials WHERE id = ${credential.officialId}::uuid FOR UPDATE`;
        const current = await tx.tournamentOfficial.findFirst({
          where: {
            id: credential.officialId,
            tournamentId: credential.tournamentId,
            isActive: true,
            tournament: {
              softDeletedAt: null,
              status: { not: TournamentStatus.ARCHIVED },
            },
          },
          select: { passcodeHash: true },
        });
        if (!current || !(await this.compare(passcode, current.passcodeHash)))
          throw new UnauthorizedException(INVALID_OFFICIAL_CREDENTIALS_ERROR);
        await tx.tournamentOfficialSession.updateMany({
          where: {
            officialId: credential.officialId,
            active: true,
            OR: [{ expiresAt: { lte: now } }, { expiresAt: null }],
          },
          data: { active: false, revokedAt: now },
        });
        const owner = await tx.tournamentOfficialSession.findFirst({
          where: {
            officialId: credential.officialId,
            active: true,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        });
        if (owner && owner.id !== observed)
          return { kind: 'conflict', conflict: owner.id };
        if (owner)
          await tx.tournamentOfficialSession.update({
            where: { id: owner.id },
            data: { active: false, revokedAt: now },
          });
        const session = await tx.tournamentOfficialSession.create({
          data: {
            officialId: credential.officialId,
            deviceId,
            tokenHash: this.tokenHash(token),
            expiresAt,
            lastSeenAt: now,
          },
          select: sessionSelect,
        });
        return {
          kind: 'created',
          session: this.present(session),
          sessionToken: token,
          revokedSessionId: owner?.id ?? null,
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  private async verify(
    code: string,
    passcode: string,
    expectedRole: TournamentOfficialRole | undefined,
  ): Promise<Credentials> {
    if (Buffer.byteLength(passcode, 'utf8') > BCRYPT_MAX_BYTES) {
      await this.compare(passcode, await this.dummyHash);
      throw new UnauthorizedException(INVALID_OFFICIAL_CREDENTIALS_ERROR);
    }
    const tournament = await this.prisma.tournament.findFirst({
      where: {
        publicCode: code,
        softDeletedAt: null,
        status: { not: TournamentStatus.ARCHIVED },
      },
      select: { id: true },
    });
    const official =
      tournament &&
      (await this.prisma.tournamentOfficial.findFirst({
        where: {
          tournamentId: tournament.id,
          passcodeLookupDigest: this.passcodeDigest(passcode),
          isActive: true,
        },
        select: { id: true, passcodeHash: true, role: true },
      }));
    const valid =
      official && (await this.compare(passcode, official.passcodeHash));
    if (
      !tournament ||
      !official ||
      !valid ||
      (expectedRole && official.role !== expectedRole)
    ) {
      if (!official) await this.compare(passcode, await this.dummyHash);
      throw new UnauthorizedException(INVALID_OFFICIAL_CREDENTIALS_ERROR);
    }
    return {
      tournamentId: tournament.id,
      officialId: official.id,
      passcodeHash: official.passcodeHash,
      role: official.role,
      tournamentCode: code,
    };
  }
  private async compare(value: string, digest: string) {
    return (
      Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES &&
      compare(value, digest)
    );
  }
  private normalize(code: string, passcode: string, deviceId: string) {
    const normalizedDevice = deviceId.trim();
    if (!normalizedDevice)
      throw new UnauthorizedException(INVALID_OFFICIAL_CREDENTIALS_ERROR);
    return {
      code: code.trim().toUpperCase(),
      passcode: passcode.trim(),
      deviceId: normalizedDevice,
    };
  }
  private async rateLimit(
    input: { code: string; passcode: string },
    ip: string,
  ) {
    const [identity, address] = await Promise.all([
      this.redis.incrementWithExpiry(
        this.redisKey('identity', `${input.code}\0${input.passcode}`),
        this.window,
      ),
      this.redis.incrementWithExpiry(
        this.redisKey('ip', ip.trim() || 'unknown'),
        this.window,
      ),
    ]);
    if (identity > this.identityLimit || address > this.ipLimit)
      throw new HttpException(
        OFFICIAL_ACCESS_RATE_LIMITED_ERROR,
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
  private redisKey(namespace: string, value: string) {
    return `official-access:${namespace}:${createHmac('sha256', this.sessionSecret).update(namespace).update('\0').update(value).digest('base64url')}`;
  }
  private tokenHash(token: string) {
    return createHmac('sha256', this.sessionSecret)
      .update('official-session-token')
      .update('\0')
      .update(token)
      .digest('base64url');
  }
  private passcodeDigest(passcode: string) {
    return createHmac('sha256', this.passcodeSecret)
      .update(passcode)
      .digest('hex');
  }
  private challenge(
    observedSessionId: string,
    officialId: string,
    deviceId: string,
  ) {
    const payload: Challenge = {
      version: 1,
      observedSessionId,
      officialId,
      deviceId,
      expiresAt: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS,
      nonce: randomBytes(16).toString('base64url'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.sessionSecret)
      .update('official-takeover')
      .update('\0')
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }
  private verifyChallenge(token: string): Challenge {
    const [encoded, signature] = token.split('.');
    if (
      !encoded ||
      !signature ||
      token.length > 2048 ||
      !/^[\w-]+$/.test(encoded) ||
      !/^[\w-]+$/.test(signature)
    )
      throw new UnauthorizedException(INVALID_OFFICIAL_TAKEOVER_ERROR);
    const expected = createHmac('sha256', this.sessionSecret)
      .update('official-takeover')
      .update('\0')
      .update(encoded)
      .digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException(INVALID_OFFICIAL_TAKEOVER_ERROR);
    try {
      const data: unknown = JSON.parse(
        Buffer.from(encoded, 'base64url').toString(),
      );
      if (
        !this.isChallenge(data) ||
        data.expiresAt <= Math.floor(Date.now() / 1000)
      )
        throw new Error();
      return data;
    } catch {
      throw new UnauthorizedException(INVALID_OFFICIAL_TAKEOVER_ERROR);
    }
  }
  private isChallenge(value: unknown): value is Challenge {
    const x = value as Record<string, unknown>;
    return (
      !!x &&
      x.version === 1 &&
      typeof x.observedSessionId === 'string' &&
      UUID.test(x.observedSessionId) &&
      typeof x.officialId === 'string' &&
      UUID.test(x.officialId) &&
      typeof x.deviceId === 'string' &&
      typeof x.expiresAt === 'number' &&
      typeof x.nonce === 'string'
    );
  }
  private present(row: SessionRow): ValidatedOfficialSession {
    if (!row.expiresAt) throw new Error('Official session missing expiry');
    const a = row.official.assignments[0] ?? null;
    return {
      sessionId: row.id,
      deviceId: row.deviceId,
      expiresAt: row.expiresAt.toISOString(),
      officialId: row.official.id,
      tournamentId: row.official.tournament.id,
      official: {
        id: row.official.id,
        name: row.official.name,
        role: row.official.role,
      },
      tournament: row.official.tournament,
      activeAssignment: a
        ? { ...a, match: { ...a.match, status: a.match.status as MatchStatus } }
        : null,
      status: a ? 'IN_MATCH' : 'READY',
    };
  }
  private async resolveIdentity(
    sessionId: string,
  ): Promise<ValidatedOfficialSession | null> {
    const row = await this.prisma.tournamentOfficialSession.findFirst({
      where: {
        id: sessionId,
        active: true,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: sessionSelect,
    });
    return row ? this.present(row) : null;
  }
}
