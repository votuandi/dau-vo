import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { IdentityNormalizationService } from './identity-normalization.service';
import {
  INVALID_CREDENTIALS_ERROR,
  LOGIN_RATE_LIMITED_ERROR,
} from './admin-auth.constants';
import type { AuthenticatedUser, CreatedSession } from './admin-auth.types';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DUMMY_PASSWORD_COST = 12;
const IP_RATE_LIMIT_MULTIPLIER = 20;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

@Injectable()
export class AuthService {
  private readonly adminSessionSecret: string;
  private readonly loginRateLimitMaxAttempts: number;
  private readonly loginRateLimitWindowSeconds: number;
  private readonly sessionTtlSeconds: number;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(RedisService)
    private readonly redis: RedisService,
    @Inject(IdentityNormalizationService)
    private readonly normalizer: IdentityNormalizationService,
  ) {
    this.adminSessionSecret = config.getOrThrow('ADMIN_SESSION_SECRET', {
      infer: true,
    });
    this.loginRateLimitMaxAttempts = config.getOrThrow(
      'ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS',
      { infer: true },
    );
    this.loginRateLimitWindowSeconds = config.getOrThrow(
      'ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS',
      { infer: true },
    );
    this.sessionTtlSeconds = config.getOrThrow('ADMIN_SESSION_TTL_SECONDS', {
      infer: true,
    });
    this.dummyPasswordHash = hash(
      randomBytes(SESSION_TOKEN_BYTES).toString('base64url'),
      DUMMY_PASSWORD_COST,
    );
  }

  async login(
    username: string,
    password: string,
    clientAddress: string,
  ): Promise<CreatedSession> {
    const normalizedUsername = this.normalizer.username(username);
    const identityRateLimitKey = this.deriveRedisKey(
      'login-rate:identity',
      normalizedUsername,
    );
    const ipRateLimitKey = this.deriveRedisKey('login-rate:ip', clientAddress);

    const [identityAttempts, ipAttempts] = await Promise.all([
      this.redis.incrementWithExpiry(
        identityRateLimitKey,
        this.loginRateLimitWindowSeconds,
      ),
      this.redis.incrementWithExpiry(
        ipRateLimitKey,
        this.loginRateLimitWindowSeconds,
      ),
    ]);

    if (
      identityAttempts > this.loginRateLimitMaxAttempts ||
      ipAttempts > this.loginRateLimitMaxAttempts * IP_RATE_LIMIT_MULTIPLIER
    ) {
      throw new HttpException(
        LOGIN_RATE_LIMITED_ERROR,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      select: { id: true, passwordHash: true, username: true, isActive: true, deletedAt: true, fullName: true, role: true },
      where: { normalizedUsername },
    });
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await compare(password, passwordHash);
    const passwordFitsBcrypt =
      Buffer.byteLength(password, 'utf8') <= MAX_BCRYPT_PASSWORD_BYTES;

    if (user === null || !user.isActive || user.deletedAt !== null || !passwordMatches || !passwordFitsBcrypt) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_ERROR);
    }

    await this.redis.delete(identityRateLimitKey);

    const sessionToken = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    await this.redis.setWithExpiry(
      this.sessionRedisKey(sessionToken),
      user.id,
      this.sessionTtlSeconds,
    );

    return {
      user: this.safeUser(user),
      sessionToken,
    };
  }

  async resolveSession(sessionToken: string): Promise<AuthenticatedUser | null> {
    if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
      return null;
    }

    const sessionKey = this.sessionRedisKey(sessionToken);
    const userId = await this.redis.get(sessionKey);

    if (userId === null) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      select: { id: true, username: true, fullName: true, role: true, isActive: true, deletedAt: true },
      where: { id: userId },
    });

    if (user === null || !user.isActive || user.deletedAt !== null) {
      await this.redis.delete(sessionKey);
      return null;
    }

    return this.safeUser(user);
  }

  async revokeSession(sessionToken: string): Promise<void> {
    if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
      return;
    }

    await this.redis.delete(this.sessionRedisKey(sessionToken));
  }

  private sessionRedisKey(sessionToken: string): string {
    return this.deriveRedisKey('session', sessionToken);
  }

  private deriveRedisKey(namespace: string, value: string): string {
    const digest = createHmac('sha256', this.adminSessionSecret)
      .update(namespace)
      .update('\u0000')
      .update(value)
      .digest('base64url');

    return `auth:${namespace}:${digest}`;
  }

  async register(input: { fullName: string; username: string; email: string; phone: string; organization?: string; password: string }, clientAddress: string): Promise<CreatedSession> {
    const normalizedUsername = this.normalizer.username(input.username);
    const normalizedEmail = this.normalizer.email(input.email);
    const normalizedPhone = this.normalizer.phone(input.phone);
    if (normalizedPhone.length < 6) throw new HttpException({ code: 'INVALID_PHONE', message: 'Phone number is invalid' }, HttpStatus.BAD_REQUEST);
    try {
      await this.prisma.user.create({ data: { fullName: input.fullName.trim(), username: input.username.trim(), normalizedUsername, email: input.email.trim(), normalizedEmail, phone: input.phone.trim(), normalizedPhone, organization: input.organization?.trim() || null, passwordHash: await hash(input.password, DUMMY_PASSWORD_COST), role: UserRole.USER, isActive: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        const code = target.includes('normalized_email') ? 'EMAIL_ALREADY_EXISTS' : target.includes('normalized_phone') ? 'PHONE_ALREADY_EXISTS' : 'USERNAME_ALREADY_EXISTS';
        throw new ConflictException({ code, message: 'An account with this identity already exists' });
      }
      throw error;
    }
    return this.login(input.username, input.password, clientAddress);
  }

  private safeUser(user: { id: string; username: string; fullName: string | null; role: UserRole; isActive: boolean }): AuthenticatedUser {
    return { id: user.id, username: user.username, fullName: user.fullName, role: user.role, isActive: user.isActive };
  }
}
