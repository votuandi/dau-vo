import type { PinoLogger } from 'nestjs-pino';

import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

interface HealthTestHarness {
  healthService: HealthService;
  ping: jest.Mock<Promise<string>, []>;
  queryRaw: jest.Mock<Promise<unknown>, unknown[]>;
}

function createHarness(options?: {
  postgresError?: Error;
  redisError?: Error;
}): HealthTestHarness {
  const queryRaw = jest.fn<Promise<unknown>, unknown[]>();
  const ping = jest.fn<Promise<string>, []>();

  if (options?.postgresError === undefined) {
    queryRaw.mockResolvedValue([{ value: 1 }]);
  } else {
    queryRaw.mockRejectedValue(options.postgresError);
  }

  if (options?.redisError === undefined) {
    ping.mockResolvedValue('PONG');
  } else {
    ping.mockRejectedValue(options.redisError);
  }

  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const redis = { ping } as unknown as RedisService;
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;

  return {
    healthService: new HealthService(prisma, redis, logger),
    ping,
    queryRaw,
  };
}

describe('HealthService', () => {
  it('reports healthy dependencies', async () => {
    const { healthService, ping, queryRaw } = createHarness();

    await expect(healthService.check()).resolves.toMatchObject({
      services: {
        api: { status: 'up' },
        postgres: { status: 'up' },
        redis: { status: 'up' },
      },
      status: 'ok',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports a degraded API without exposing dependency errors', async () => {
    const { healthService } = createHarness({
      redisError: new Error('redis password must not reach the response'),
    });

    const report = await healthService.check();

    expect(report).toMatchObject({
      services: {
        api: { status: 'up' },
        postgres: { status: 'up' },
        redis: { status: 'down' },
      },
      status: 'degraded',
    });
    expect(JSON.stringify(report)).not.toContain('redis password');
  });
});
