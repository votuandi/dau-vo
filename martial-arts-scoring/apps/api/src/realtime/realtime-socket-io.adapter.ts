import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';

type NestSocketIoOptions = Partial<ServerOptions> & {
  namespace?: string;
  server?: unknown;
};

export class RealtimeSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly webOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(
    port: number,
    options?: NestSocketIoOptions,
  ): unknown {
    return super.createIOServer(port, {
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
        callback(null, origin === undefined || origin === this.webOrigin);
      },
      cors: {
        credentials: true,
        origin: this.webOrigin,
      },
    }) as unknown;
  }
}
