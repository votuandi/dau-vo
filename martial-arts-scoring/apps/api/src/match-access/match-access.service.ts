import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditEventType,
  MatchAccessRole,
  MatchRole,
  RefereeSlot,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeSessionRegistryService } from '../realtime/realtime-session-registry.service';
import { RedisService } from '../redis/redis.service';
import {
  INVALID_MATCH_CREDENTIALS_ERROR,
  INVALID_TAKEOVER_ERROR,
  MATCH_ACCESS_RATE_LIMITED_ERROR,
  SESSION_ALREADY_ACTIVE_MESSAGE,
} from './match-access.constants';
import type {
  CreatedMatchSession,
  MatchSessionIdentity,
  SessionAlreadyActiveError,
  ValidatedMatchSession,
} from './match-access.types';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BCRYPT_MAX_INPUT_BYTES = 72;
const DUMMY_CODE_COST = 12;
const TAKEOVER_CHALLENGE_TTL_SECONDS = 2 * 60;
const TRANSACTION_MAX_WAIT_MS = 5_000;
const TRANSACTION_TIMEOUT_MS = 15_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface VerifiedCredential {
  accessCodeId: string;
  codeHash: string;
  matchId: string;
  matchPublicId: string;
  role: MatchAccessRole;
}

interface TakeoverChallengePayload {
  accessCodeId: string;
  deviceId: string;
  expiresAt: number;
  matchId: string;
  matchPublicId: string;
  nonce: string;
  observedSessionId: string;
  version: 1;
}

interface OwnershipConflict {
  accessCodeId: string;
  deviceId: string;
  matchId: string;
  matchPublicId: string;
  observedSessionId: string;
}

type SessionAcquisitionResult =
  | {
      kind: 'created';
      revokedSessionId: string | null;
      session: MatchSessionIdentity;
    }
  | { conflict: OwnershipConflict; kind: 'conflict' };

interface SessionRole {
  refereeSlot: RefereeSlot | null;
  role: MatchRole;
}

@Injectable()
export class MatchAccessService {
  private readonly dummyCodeHash: Promise<string>;
  private readonly rateLimitIdentityMaxAttempts: number;
  private readonly rateLimitIpMaxAttempts: number;
  private readonly rateLimitWindowSeconds: number;
  private readonly matchSessionSecret: string;
  private readonly sessionTtlSeconds: number;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(RealtimeSessionRegistryService)
    private readonly realtimeSessions: RealtimeSessionRegistryService,
  ) {
    this.matchSessionSecret = config.getOrThrow('MATCH_SESSION_SECRET', {
      infer: true,
    });
    this.sessionTtlSeconds = config.getOrThrow('MATCH_SESSION_TTL_SECONDS', {
      infer: true,
    });
    this.rateLimitIdentityMaxAttempts = config.getOrThrow(
      'MATCH_ACCESS_RATE_LIMIT_IDENTITY_MAX_ATTEMPTS',
      { infer: true },
    );
    this.rateLimitIpMaxAttempts = config.getOrThrow(
      'MATCH_ACCESS_RATE_LIMIT_IP_MAX_ATTEMPTS',
      { infer: true },
    );
    this.rateLimitWindowSeconds = config.getOrThrow(
      'MATCH_ACCESS_RATE_LIMIT_WINDOW_SECONDS',
      { infer: true },
    );
    this.dummyCodeHash = hash(
      randomBytes(SESSION_TOKEN_BYTES).toString('base64url'),
      DUMMY_CODE_COST,
    );
  }

  async login(
    matchPublicId: string,
    securityCode: string,
    deviceId: string,
    clientAddress: string,
  ): Promise<CreatedMatchSession> {
    const normalized = this.normalizeLoginInput(
      matchPublicId,
      securityCode,
      deviceId,
    );
    await this.enforceAccessRateLimit(normalized, clientAddress);
    const credential = await this.verifyCredential(
      normalized.matchPublicId,
      normalized.securityCode,
    );
    const sessionToken = this.createSessionToken();
    const tokenHash = this.hashSessionToken(sessionToken);
    const now = new Date();
    const expiresAt = this.sessionExpiry(now);

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const lockedCredential = await this.lockAndReverifyCredential(
          transaction,
          credential,
          normalized.securityCode,
        );

        await this.deactivateStaleSessions(
          transaction,
          lockedCredential.accessCodeId,
          now,
        );
        const currentOwner = await this.findCurrentOwner(
          transaction,
          lockedCredential.accessCodeId,
          now,
        );

        // The browser-generated device ID is metadata, not proof that the
        // caller owns an existing session. Any live owner must go through the
        // explicit compare-and-swap takeover flow.
        if (currentOwner !== null) {
          return {
            conflict: this.ownershipConflict(
              lockedCredential,
              currentOwner.id,
              normalized.deviceId,
            ),
            kind: 'conflict',
          } satisfies SessionAcquisitionResult;
        }

        const session = await this.createSessionRecord(
          transaction,
          lockedCredential,
          normalized.deviceId,
          tokenHash,
          now,
          expiresAt,
          'LOGIN',
        );

        return {
          kind: 'created',
          revokedSessionId: null,
          session,
        } satisfies SessionAcquisitionResult;
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );

    if (result.kind === 'conflict') {
      throw new HttpException(
        this.sessionAlreadyActiveError(result.conflict),
        HttpStatus.CONFLICT,
      );
    }

    return { session: result.session, sessionToken };
  }

  async takeover(
    matchPublicId: string,
    securityCode: string,
    deviceId: string,
    takeoverToken: string,
    clientAddress: string,
  ): Promise<CreatedMatchSession> {
    const normalized = this.normalizeLoginInput(
      matchPublicId,
      securityCode,
      deviceId,
    );
    const challenge = this.verifyTakeoverToken(takeoverToken);

    if (
      challenge.matchPublicId !== normalized.matchPublicId ||
      challenge.deviceId !== normalized.deviceId
    ) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    await this.enforceAccessRateLimit(normalized, clientAddress);

    const credential = await this.verifyCredential(
      normalized.matchPublicId,
      normalized.securityCode,
    );

    if (
      credential.accessCodeId !== challenge.accessCodeId ||
      credential.matchId !== challenge.matchId
    ) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    const sessionToken = this.createSessionToken();
    const tokenHash = this.hashSessionToken(sessionToken);
    const now = new Date();
    const expiresAt = this.sessionExpiry(now);

    const result = await this.prisma.$transaction(
      async (transaction) => {
        const lockedCredential = await this.lockAndReverifyCredential(
          transaction,
          credential,
          normalized.securityCode,
        );

        await this.deactivateStaleSessions(
          transaction,
          lockedCredential.accessCodeId,
          now,
        );
        const currentOwner = await this.findCurrentOwner(
          transaction,
          lockedCredential.accessCodeId,
          now,
        );

        if (
          currentOwner !== null &&
          currentOwner.id !== challenge.observedSessionId
        ) {
          return {
            conflict: this.ownershipConflict(
              lockedCredential,
              currentOwner.id,
              normalized.deviceId,
            ),
            kind: 'conflict',
          } satisfies SessionAcquisitionResult;
        }

        const revokedSessionId = currentOwner?.id ?? null;

        if (currentOwner !== null) {
          await this.revokeSessionRecord(transaction, currentOwner.id, now);
        }

        const session = await this.createSessionRecord(
          transaction,
          lockedCredential,
          normalized.deviceId,
          tokenHash,
          now,
          expiresAt,
          'TAKEOVER',
        );

        return {
          kind: 'created',
          revokedSessionId,
          session,
        } satisfies SessionAcquisitionResult;
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );

    if (result.kind === 'conflict') {
      throw new HttpException(
        this.sessionAlreadyActiveError(result.conflict),
        HttpStatus.CONFLICT,
      );
    }

    if (result.revokedSessionId !== null) {
      this.realtimeSessions.revokeSessions([result.revokedSessionId]);
    }

    return { session: result.session, sessionToken };
  }

  async resolveSession(
    sessionToken: string,
  ): Promise<ValidatedMatchSession | null> {
    if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
      return null;
    }

    const tokenHash = this.hashSessionToken(sessionToken);

    return this.prisma.$transaction(
      async (transaction) => {
        const initialSession = await transaction.matchSession.findFirst({
          select: { accessCodeId: true },
          where: { tokenHash },
        });

        if (initialSession === null) {
          return null;
        }

        const accessCodeExists = await this.lockAccessCode(
          transaction,
          initialSession.accessCodeId,
        );

        if (!accessCodeExists) {
          return null;
        }

        const now = new Date();
        await this.deactivateStaleSessions(
          transaction,
          initialSession.accessCodeId,
          now,
        );

        const session = await transaction.matchSession.findFirst({
          select: {
            accessCodeId: true,
            deviceId: true,
            expiresAt: true,
            id: true,
            match: { select: { publicId: true } },
            matchId: true,
            refereeSlot: true,
            role: true,
          },
          where: {
            active: true,
            expiresAt: { gt: now },
            revokedAt: null,
            tokenHash,
          },
        });

        if (session === null || session.expiresAt === null) {
          return null;
        }

        const currentOwner = await this.findCurrentOwner(
          transaction,
          session.accessCodeId,
          now,
        );

        if (currentOwner?.id !== session.id) {
          return null;
        }

        const touched = await transaction.matchSession.updateMany({
          data: { lastSeenAt: now },
          where: {
            active: true,
            id: session.id,
            revokedAt: null,
          },
        });

        if (touched.count !== 1) {
          return null;
        }

        return {
          accessCodeId: session.accessCodeId,
          deviceId: session.deviceId,
          expiresAt: session.expiresAt.toISOString(),
          matchId: session.matchId,
          matchPublicId: session.match.publicId,
          refereeSlot: session.refereeSlot,
          role: session.role,
          sessionId: session.id,
        };
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  async revokeSession(sessionToken: string): Promise<void> {
    if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
      return;
    }

    const tokenHash = this.hashSessionToken(sessionToken);

    const revokedSessionId = await this.prisma.$transaction(
      async (transaction) => {
        const initialSession = await transaction.matchSession.findFirst({
          select: { accessCodeId: true },
          where: { tokenHash },
        });

        if (initialSession === null) {
          return null;
        }

        const accessCodeExists = await this.lockAccessCode(
          transaction,
          initialSession.accessCodeId,
        );

        if (!accessCodeExists) {
          return null;
        }

        const now = new Date();
        await this.deactivateStaleSessions(
          transaction,
          initialSession.accessCodeId,
          now,
        );
        const session = await transaction.matchSession.findFirst({
          select: { id: true, matchId: true },
          where: {
            active: true,
            revokedAt: null,
            tokenHash,
          },
        });

        if (session === null) {
          return null;
        }

        await this.revokeSessionRecord(transaction, session.id, now);
        await transaction.auditLog.create({
          data: {
            eventType: AuditEventType.SESSION_ACTION,
            matchId: session.matchId,
            metadata: { action: 'LOGOUT' },
            sessionId: session.id,
          },
        });

        return session.id;
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );

    if (revokedSessionId !== null) {
      this.realtimeSessions.revokeSessions([revokedSessionId]);
    }
  }

  private async verifyCredential(
    matchPublicId: string,
    securityCode: string,
  ): Promise<VerifiedCredential> {
    const match = await this.prisma.match.findUnique({
      select: {
        accessCodes: {
          select: { codeHash: true, id: true, role: true },
        },
        id: true,
        publicId: true,
      },
      where: { publicId: matchPublicId },
    });
    const codeFitsBcrypt =
      Buffer.byteLength(securityCode, 'utf8') <= BCRYPT_MAX_INPUT_BYTES;

    if (match === null) {
      const dummyCodeHash = await this.dummyCodeHash;
      await Promise.all(
        Array.from({ length: 4 }, () => compare(securityCode, dummyCodeHash)),
      );
      throw new UnauthorizedException(INVALID_MATCH_CREDENTIALS_ERROR);
    }

    const comparisonInput = codeFitsBcrypt
      ? securityCode
      : 'invalid-overlong-security-code';
    const matches = await Promise.all(
      match.accessCodes.map((accessCode) =>
        compare(comparisonInput, accessCode.codeHash),
      ),
    );
    const matchingIndex = matches.findIndex(Boolean);
    const accessCode = match.accessCodes[matchingIndex];

    if (!codeFitsBcrypt || accessCode === undefined) {
      throw new UnauthorizedException(INVALID_MATCH_CREDENTIALS_ERROR);
    }

    return {
      accessCodeId: accessCode.id,
      codeHash: accessCode.codeHash,
      matchId: match.id,
      matchPublicId: match.publicId,
      role: accessCode.role,
    };
  }

  private async lockAndReverifyCredential(
    transaction: Prisma.TransactionClient,
    credential: VerifiedCredential,
    securityCode: string,
  ): Promise<VerifiedCredential> {
    const accessCodeExists = await this.lockAccessCode(
      transaction,
      credential.accessCodeId,
    );

    if (!accessCodeExists) {
      throw new UnauthorizedException(INVALID_MATCH_CREDENTIALS_ERROR);
    }

    const accessCode = await transaction.matchAccessCode.findUnique({
      select: {
        codeHash: true,
        id: true,
        match: { select: { id: true, publicId: true } },
        role: true,
      },
      where: { id: credential.accessCodeId },
    });

    if (
      accessCode === null ||
      accessCode.match.id !== credential.matchId ||
      accessCode.match.publicId !== credential.matchPublicId ||
      !(await compare(securityCode, accessCode.codeHash))
    ) {
      throw new UnauthorizedException(INVALID_MATCH_CREDENTIALS_ERROR);
    }

    return {
      accessCodeId: accessCode.id,
      codeHash: accessCode.codeHash,
      matchId: accessCode.match.id,
      matchPublicId: accessCode.match.publicId,
      role: accessCode.role,
    };
  }

  private async lockAccessCode(
    transaction: Prisma.TransactionClient,
    accessCodeId: string,
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "match_access_codes"
      WHERE "id" = ${accessCodeId}::uuid
      FOR UPDATE
    `;

    return rows.length === 1;
  }

  private async deactivateStaleSessions(
    transaction: Prisma.TransactionClient,
    accessCodeId: string,
    now: Date,
  ): Promise<void> {
    await transaction.matchSession.updateMany({
      data: { active: false },
      where: {
        accessCodeId,
        active: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { lte: now } },
          { revokedAt: { not: null } },
        ],
      },
    });
  }

  private findCurrentOwner(
    transaction: Prisma.TransactionClient,
    accessCodeId: string,
    now: Date,
  ): Promise<{ deviceId: string; id: string } | null> {
    return transaction.matchSession.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { deviceId: true, id: true },
      where: {
        accessCodeId,
        active: true,
        expiresAt: { gt: now },
        revokedAt: null,
      },
    });
  }

  private async createSessionRecord(
    transaction: Prisma.TransactionClient,
    credential: VerifiedCredential,
    deviceId: string,
    tokenHash: string,
    now: Date,
    expiresAt: Date,
    action: 'LOGIN' | 'TAKEOVER',
  ): Promise<MatchSessionIdentity> {
    const sessionRole = this.sessionRole(credential.role);
    const session = await transaction.matchSession.create({
      data: {
        accessCodeId: credential.accessCodeId,
        active: true,
        deviceId,
        expiresAt,
        lastSeenAt: now,
        matchId: credential.matchId,
        refereeSlot: sessionRole.refereeSlot,
        role: sessionRole.role,
        tokenHash,
      },
      select: {
        deviceId: true,
        expiresAt: true,
        id: true,
        refereeSlot: true,
        role: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        eventType: AuditEventType.SESSION_ACTION,
        matchId: credential.matchId,
        metadata: {
          action,
          deviceId,
          refereeSlot: sessionRole.refereeSlot,
          role: sessionRole.role,
        },
        sessionId: session.id,
      },
    });

    if (session.expiresAt === null) {
      throw new Error('Created match session is missing its expiry');
    }

    return {
      deviceId: session.deviceId,
      expiresAt: session.expiresAt.toISOString(),
      matchPublicId: credential.matchPublicId,
      refereeSlot: session.refereeSlot,
      role: session.role,
      sessionId: session.id,
    };
  }

  private async revokeSessionRecord(
    transaction: Prisma.TransactionClient,
    sessionId: string,
    revokedAt: Date,
  ): Promise<void> {
    await transaction.matchSession.updateMany({
      data: { active: false, revokedAt },
      where: { active: true, id: sessionId },
    });
  }

  private sessionRole(accessRole: MatchAccessRole): SessionRole {
    switch (accessRole) {
      case MatchAccessRole.REFEREE_1:
        return {
          refereeSlot: RefereeSlot.REFEREE_1,
          role: MatchRole.REFEREE,
        };
      case MatchAccessRole.REFEREE_2:
        return {
          refereeSlot: RefereeSlot.REFEREE_2,
          role: MatchRole.REFEREE,
        };
      case MatchAccessRole.REFEREE_3:
        return {
          refereeSlot: RefereeSlot.REFEREE_3,
          role: MatchRole.REFEREE,
        };
      case MatchAccessRole.INSPECTOR:
        return { refereeSlot: null, role: MatchRole.INSPECTOR };
      default: {
        const exhaustiveRole: never = accessRole;
        throw new Error(`Unsupported match access role: ${exhaustiveRole}`);
      }
    }
  }

  private normalizeLoginInput(
    matchPublicId: string,
    securityCode: string,
    deviceId: string,
  ): {
    deviceId: string;
    matchPublicId: string;
    securityCode: string;
  } {
    const normalizedDeviceId = deviceId.trim();

    if (normalizedDeviceId.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_DEVICE_ID',
        message: 'Device ID must not be empty',
      });
    }

    return {
      deviceId: normalizedDeviceId,
      matchPublicId: matchPublicId.trim().toUpperCase(),
      securityCode: securityCode.trim(),
    };
  }

  private async enforceAccessRateLimit(
    input: { matchPublicId: string; securityCode: string },
    clientAddress: string,
  ): Promise<void> {
    const identityKey = this.deriveRedisKey(
      'access-rate:identity',
      `${input.matchPublicId}\u0000${input.securityCode}`,
    );
    const ipKey = this.deriveRedisKey(
      'access-rate:ip',
      clientAddress.trim() || 'unknown',
    );
    const [identityAttempts, ipAttempts] = await Promise.all([
      this.redis.incrementWithExpiry(identityKey, this.rateLimitWindowSeconds),
      this.redis.incrementWithExpiry(ipKey, this.rateLimitWindowSeconds),
    ]);

    if (
      identityAttempts > this.rateLimitIdentityMaxAttempts ||
      ipAttempts > this.rateLimitIpMaxAttempts
    ) {
      throw new HttpException(
        MATCH_ACCESS_RATE_LIMITED_ERROR,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private deriveRedisKey(namespace: string, value: string): string {
    const digest = createHmac('sha256', this.matchSessionSecret)
      .update(namespace)
      .update('\u0000')
      .update(value)
      .digest('base64url');

    return `match-access:${namespace}:${digest}`;
  }

  private createSessionToken(): string {
    return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  }

  /**
   * Derives the database lookup value for an already-authenticated match
   * session token. Realtime command services use this only inside their own
   * match-locked transactions so they can validate ownership without a
   * separate preflight transaction changing command ordering.
   */
  hashSessionToken(sessionToken: string): string {
    return createHmac('sha256', this.matchSessionSecret)
      .update('match-session-token')
      .update('\u0000')
      .update(sessionToken)
      .digest('base64url');
  }

  private sessionExpiry(now: Date): Date {
    return new Date(now.getTime() + this.sessionTtlSeconds * 1_000);
  }

  private ownershipConflict(
    credential: VerifiedCredential,
    observedSessionId: string,
    deviceId: string,
  ): OwnershipConflict {
    return {
      accessCodeId: credential.accessCodeId,
      deviceId,
      matchId: credential.matchId,
      matchPublicId: credential.matchPublicId,
      observedSessionId,
    };
  }

  private sessionAlreadyActiveError(
    conflict: OwnershipConflict,
  ): SessionAlreadyActiveError {
    return {
      canTakeOver: true,
      code: 'SESSION_ALREADY_ACTIVE',
      message: SESSION_ALREADY_ACTIVE_MESSAGE,
      takeoverToken: this.createTakeoverToken(conflict),
    };
  }

  private createTakeoverToken(conflict: OwnershipConflict): string {
    const payload: TakeoverChallengePayload = {
      ...conflict,
      expiresAt:
        Math.floor(Date.now() / 1_000) + TAKEOVER_CHALLENGE_TTL_SECONDS,
      nonce: randomBytes(16).toString('base64url'),
      version: 1,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.signTakeoverPayload(encodedPayload);

    return `${encodedPayload}.${signature.toString('base64url')}`;
  }

  private verifyTakeoverToken(token: string): TakeoverChallengePayload {
    const separatorIndex = token.indexOf('.');

    if (
      separatorIndex <= 0 ||
      separatorIndex !== token.lastIndexOf('.') ||
      token.length > 2048
    ) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    const encodedPayload = token.slice(0, separatorIndex);
    const encodedSignature = token.slice(separatorIndex + 1);

    if (
      !/^[A-Za-z0-9_-]+$/.test(encodedPayload) ||
      !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
    ) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    const expectedSignature = this.signTakeoverPayload(encodedPayload);
    const actualSignature = Buffer.from(encodedSignature, 'base64url');

    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    let payload: unknown;

    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as unknown;
    } catch {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    if (!this.isTakeoverPayload(payload)) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    if (payload.expiresAt <= Math.floor(Date.now() / 1_000)) {
      throw new UnauthorizedException(INVALID_TAKEOVER_ERROR);
    }

    return payload;
  }

  private signTakeoverPayload(encodedPayload: string): Buffer {
    return createHmac('sha256', this.matchSessionSecret)
      .update('match-takeover-challenge')
      .update('\u0000')
      .update(encodedPayload)
      .digest();
  }

  private isTakeoverPayload(
    payload: unknown,
  ): payload is TakeoverChallengePayload {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    const candidate = payload as Record<string, unknown>;

    return (
      candidate.version === 1 &&
      typeof candidate.accessCodeId === 'string' &&
      UUID_PATTERN.test(candidate.accessCodeId) &&
      typeof candidate.matchId === 'string' &&
      UUID_PATTERN.test(candidate.matchId) &&
      typeof candidate.observedSessionId === 'string' &&
      UUID_PATTERN.test(candidate.observedSessionId) &&
      typeof candidate.matchPublicId === 'string' &&
      candidate.matchPublicId.length > 0 &&
      candidate.matchPublicId.length <= 32 &&
      typeof candidate.deviceId === 'string' &&
      candidate.deviceId.length > 0 &&
      candidate.deviceId.length <= 255 &&
      typeof candidate.nonce === 'string' &&
      /^[A-Za-z0-9_-]{22}$/.test(candidate.nonce) &&
      typeof candidate.expiresAt === 'number' &&
      Number.isSafeInteger(candidate.expiresAt)
    );
  }
}
