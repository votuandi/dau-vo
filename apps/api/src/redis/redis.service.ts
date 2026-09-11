import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

import type { EnvironmentVariables } from '../config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  /**
   * Socket.IO needs separate Redis connections for publishing and subscribing.
   * They are intentionally ephemeral: the authoritative match, session and
   * score records always remain in PostgreSQL.
   */
  private readonly socketIoClients = new Set<Redis>();
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

  async incrementByWithExpiry(
    key: string,
    increment: 1 | -1,
    ttlSeconds: number,
  ): Promise<number> {
    await this.connectIfNeeded();
    const result = await this.client.eval(
      [
        "local count = redis.call('INCRBY', KEYS[1], ARGV[1])",
        "if count <= 0 then redis.call('DEL', KEYS[1]); return 0 end",
        "if count == 1 and ARGV[1] == '1' then redis.call('EXPIRE', KEYS[1], ARGV[2]) end",
        'return count',
      ].join('\n'),
      1,
      key,
      String(increment),
      String(ttlSeconds),
    );
    const count = Number(result);

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Redis returned an invalid presence counter');
    }

    return count;
  }

  createSocketIoPubSubClients(): { pubClient: Redis; subClient: Redis } {
    const pubClient = this.client.duplicate();
    const subClient = this.client.duplicate();

    for (const client of [pubClient, subClient]) {
      this.socketIoClients.add(client);
      client.on('error', (error: Error) => {
        this.logger.warn({ err: error }, 'Socket.IO Redis connection error');
      });
      client.on('end', () => {
        this.socketIoClients.delete(client);
      });
    }

    return { pubClient, subClient };
  }

  async closeSocketIoPubSubClients(clients: {
    pubClient: Redis;
    subClient: Redis;
  }): Promise<void> {
    await Promise.all(
      [clients.pubClient, clients.subClient].map(async (client) => {
        this.socketIoClients.delete(client);
        if (client.status === 'ready') {
          await client.quit();
        } else {
          client.disconnect();
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    // Socket.IO owns the pub/sub clients and shuts them down after it has
    // unsubscribed its Redis adapter. Closing them here would race adapter
    // shutdown because Nest destroys providers before closing gateways.
    if (this.client.status === 'ready') {
      await this.client.quit();
      return;
    }

    this.client.disconnect();
  }

  private async connectIfNeeded(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }

    this.connectionPromise ??= this.client.connect().finally(() => {
      this.connectionPromise = undefined;
    });
    await this.connectionPromise;
  }
}
