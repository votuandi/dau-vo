import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type {
  DependencyHealth,
  DependencyStatus,
  HealthReport,
  LivenessReport,
} from './health.types';

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  async check(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([
      this.checkDependency('postgres', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.checkDependency('redis', async () => {
        await this.redis.ping();
      }),
    ]);

    return {
      services: {
        api: { status: 'up' },
        postgres,
        redis,
      },
      status:
        postgres.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  live(): LivenessReport {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  private async checkDependency(
    dependency: 'postgres' | 'redis',
    operation: () => Promise<void>,
  ): Promise<DependencyHealth> {
    const startedAt = Date.now();
    let status: DependencyStatus = 'up';

    try {
      await this.withTimeout(operation(), HEALTH_CHECK_TIMEOUT_MS);
    } catch (error: unknown) {
      status = 'down';
      this.logger.warn(
        { dependency, err: error },
        'Dependency health check failed',
      );
    }

    return {
      latencyMs: Date.now() - startedAt,
      status,
    };
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Health check timed out')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
