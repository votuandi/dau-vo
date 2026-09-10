import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { IncomingMessage } from 'node:http';
import { type Server, type ServerOptions } from 'socket.io';

import type { RedisService } from '../redis/redis.service';

type NestSocketIoOptions = Partial<ServerOptions> & {
  namespace?: string;
  server?: unknown;
};

export class RealtimeSocketIoAdapter extends IoAdapter {
  private socketIoClients:
    ReturnType<RedisService['createSocketIoPubSubClients']> | undefined;

  constructor(
    app: INestApplicationContext,
    private readonly webOrigins: readonly string[],
    private readonly redis: RedisService,
  ) {
    super(app);
  }

  override createIOServer(
    port: number,
    options?: NestSocketIoOptions,
  ): unknown {
    const server = super.createIOServer(port, {
      ...options,
      // Socket.IO's CORS option only protects HTTP long-polling. Browsers send
      // an Origin header during the WebSocket upgrade too, so enforce the
      // configured application origin at the Engine.IO admission boundary.
      // Origin-less clients are non-browser clients and still require a valid
      // HttpOnly session cookie in the gateway middleware.
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null | undefined, success: boolean) => void,
      ) => {
        const origin = request.headers.origin;
        callback(null, origin === undefined || this.webOrigins.includes(origin));
      },
      cors: {
        credentials: true,
        origin: this.webOrigins,
      },
    }) as Server;

    this.socketIoClients = this.redis.createSocketIoPubSubClients();
    server.adapter(
      createAdapter(
        this.socketIoClients.pubClient,
        this.socketIoClients.subClient,
      ),
    );

    return server;
  }

  override async close(server: Server): Promise<void> {
    try {
      await super.close(server);
    } finally {
      const clients = this.socketIoClients;
      this.socketIoClients = undefined;

      if (clients !== undefined) {
        await this.redis.closeSocketIoPubSubClients(clients);
      }
    }
  }
}
