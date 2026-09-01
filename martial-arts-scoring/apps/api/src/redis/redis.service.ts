import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import type { EnvironmentVariables } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private connectionPromise?: Promise<void>;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
    @Inject(PinoLogger)
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedisService.name);
    this.client = new Redis(config.getOrThrow('REDIS_URL', { infer: true }), {
      connectTimeout: 2_000,
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 250, 2_000),
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn({ err: error }, 'Redis connection error');
    });
  }

  async ping(): Promise<string> {
    await this.connectIfNeeded();

    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.connectIfNeeded();
    return this.client.get(key);
  }

  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.connectIfNeeded();
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async delete(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    await this.connectIfNeeded();
    return this.client.del(...keys);
  }

  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    await this.connectIfNeeded();

    const result = await this.client.eval(
      [
        "local count = redis.call('INCR', KEYS[1])",
        "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
        'return count',
      ].join('\n'),
      1,
      key,
      String(ttlSeconds),
    );
    const count = Number(result);

    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error('Redis returned an invalid rate-limit counter');
    }

    return count;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }

    this.client.disconnect();
  }

  private async connectIfNeeded(): Promise<void> {
    if (this.client.status !== 'wait') {
      return;
    }

    this.connectionPromise ??= this.client.connect().finally(() => {
      this.connectionPromise = undefined;
    });
    await this.connectionPromise;
  }
}
