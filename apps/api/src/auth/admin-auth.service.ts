import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';

import type { EnvironmentVariables } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { IdentityNormalizationService } from './identity-normalization.service';
import {
  INVALID_CREDENTIALS_ERROR,
  LOGIN_RATE_LIMITED_ERROR,
  REGISTRATION_RATE_LIMITED_ERROR,
} from './admin-auth.constants';
import type {
  AccountProfile,
  AuthenticatedUser,
  CreatedSession,
} from './admin-auth.types';
import {
  MAX_BCRYPT_PASSWORD_BYTES,
  passwordValidationCode,
  passwordValidationMessage,
} from './password-policy';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DUMMY_PASSWORD_COST = 12;
const IP_RATE_LIMIT_MULTIPLIER = 20;
const PROFILE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  organization: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

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
      select: {
        id: true,
        passwordHash: true,
        username: true,
        isActive: true,
        deletedAt: true,
        fullName: true,
        role: true,
      },
      where: { normalizedUsername },
    });
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await compare(password, passwordHash);
    const passwordFitsBcrypt =
      Buffer.byteLength(password, 'utf8') <= MAX_BCRYPT_PASSWORD_BYTES;

    if (
      user === null ||
      !user.isActive ||
      user.deletedAt !== null ||
      !passwordMatches ||
      !passwordFitsBcrypt
    ) {
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

  async resolveSession(
    sessionToken: string,
  ): Promise<AuthenticatedUser | null> {
    if (!SESSION_TOKEN_PATTERN.test(sessionToken)) {
      return null;
    }

    const sessionKey = this.sessionRedisKey(sessionToken);
    const userId = await this.redis.get(sessionKey);

    if (userId === null) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        deletedAt: true,
      },
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

  async register(
    input: {
      fullName: string;
      username: string;
      email: string;
      phone: string;
      organization?: string;
      password: string;
    },
    clientAddress: string,
  ): Promise<CreatedSession> {
    this.assertPasswordIsValid(input.password);
    const registrationRateLimitKey = this.deriveRedisKey(
      'registration-rate:ip',
      clientAddress,
    );
    const attempts = await this.redis.incrementWithExpiry(
      registrationRateLimitKey,
      this.loginRateLimitWindowSeconds,
    );
    if (attempts > this.loginRateLimitMaxAttempts) {
      throw new HttpException(
        REGISTRATION_RATE_LIMITED_ERROR,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const normalizedUsername = this.normalizer.username(input.username);
    const normalizedEmail = this.normalizer.email(input.email);
    const normalizedPhone = this.normalizer.phone(input.phone);
    if (normalizedPhone.length < 6)
      throw new HttpException(
        { code: 'INVALID_PHONE', message: 'Phone number is invalid' },
        HttpStatus.BAD_REQUEST,
      );
    try {
      await this.prisma.user.create({
        data: {
          fullName: input.fullName.trim(),
          username: input.username.trim(),
          normalizedUsername,
          email: input.email.trim(),
          normalizedEmail,
          phone: input.phone.trim(),
          normalizedPhone,
          organization: input.organization?.trim() || null,
          passwordHash: await hash(input.password, DUMMY_PASSWORD_COST),
          role: UserRole.USER,
          isActive: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = String(error.meta?.target ?? '');
        const code = target.includes('normalized_email')
          ? 'EMAIL_ALREADY_EXISTS'
          : target.includes('normalized_phone')
            ? 'PHONE_ALREADY_EXISTS'
            : 'USERNAME_ALREADY_EXISTS';
        throw new ConflictException({
          code,
          message: 'An account with this identity already exists',
        });
      }
      throw error;
    }
    const session = await this.login(
      input.username,
      input.password,
      clientAddress,
    );
    await this.redis.delete(registrationRateLimitKey);
    return session;
  }

  async profile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({
      select: PROFILE_SELECT,
      where: { id: userId },
    });
    if (user === null)
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    return user;
  }

  async updateProfile(
    userId: string,
    input: {
      fullName?: string;
      email?: string;
      phone?: string;
      organization?: string;
    },
  ): Promise<AccountProfile> {
    const normalizedEmail =
      input.email === undefined
        ? undefined
        : this.normalizer.email(input.email);
    const normalizedPhone =
      input.phone === undefined
        ? undefined
        : this.normalizer.phone(input.phone);
    if (normalizedPhone !== undefined && normalizedPhone.length < 6)
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'Phone number is invalid',
      });
    // Check up front for a clear field-level error; the unique indexes still
    // guard the race between this lookup and the update below.
    const identityFilters = [
      ...(normalizedEmail === undefined ? [] : [{ normalizedEmail }]),
      ...(normalizedPhone === undefined ? [] : [{ normalizedPhone }]),
    ];
    if (identityFilters.length > 0) {
      const taken = await this.prisma.user.findFirst({
        select: { normalizedEmail: true, normalizedPhone: true },
        where: { id: { not: userId }, OR: identityFilters },
      });
      if (taken !== null)
        this.throwIdentityConflict(
          normalizedEmail !== undefined &&
            taken.normalizedEmail === normalizedEmail
            ? 'EMAIL_ALREADY_EXISTS'
            : 'PHONE_ALREADY_EXISTS',
        );
    }
    try {
      return await this.prisma.user.update({
        select: PROFILE_SELECT,
        where: { id: userId },
        data: {
          ...(input.fullName === undefined
            ? {}
            : { fullName: input.fullName.trim() }),
          ...(input.email === undefined
            ? {}
            : { email: input.email.trim(), normalizedEmail }),
          ...(input.phone === undefined
            ? {}
            : { phone: input.phone.trim(), normalizedPhone }),
          ...(input.organization === undefined
            ? {}
            : { organization: input.organization.trim() || null }),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        this.throwIdentityConflict(
          String(error.meta?.target ?? '').includes('normalized_email')
            ? 'EMAIL_ALREADY_EXISTS'
            : 'PHONE_ALREADY_EXISTS',
        );
      throw error;
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.assertPasswordIsValid(newPassword);
    const user = await this.prisma.user.findUnique({
      select: { passwordHash: true },
      where: { id: userId },
    });
    if (user === null || !(await compare(currentPassword, user.passwordHash)))
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect',
      });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(newPassword, DUMMY_PASSWORD_COST) },
    });
  }

  private throwIdentityConflict(
    code: 'EMAIL_ALREADY_EXISTS' | 'PHONE_ALREADY_EXISTS',
  ): never {
    throw new ConflictException({
      code,
      message:
        code === 'EMAIL_ALREADY_EXISTS'
          ? 'This email is already registered'
          : 'This phone number is already registered',
    });
  }

  private assertPasswordIsValid(password: string): void {
    const code = passwordValidationCode(password);
    if (code !== null)
      throw new BadRequestException({
        code,
        message: passwordValidationMessage(code),
      });
  }

  private safeUser(user: {
    id: string;
    username: string;
    fullName: string | null;
    role: UserRole;
    isActive: boolean;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
    };
  }
}
