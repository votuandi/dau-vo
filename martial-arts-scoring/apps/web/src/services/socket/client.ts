import { io, type Socket } from 'socket.io-client';
import { appEnv } from '@/config/env';
import type { ClientToServerEvents, ServerToClientEvents } from './contracts';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: RealtimeSocket | undefined;

export function getSocketClient(): RealtimeSocket {
  if (!socketInstance) {
    const options = {
      autoConnect: false,
      path: appEnv.socketPath,
      transports: ['websocket', 'polling'],
      withCredentials: true,
    };

    socketInstance = appEnv.socketUrl ? io(appEnv.socketUrl, options) : io(options);
  }

  return socketInstance;
}

export function connectSocket(): RealtimeSocket {
  const socket = getSocketClient();
  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket(): void {
  socketInstance?.disconnect();
}

export function reconnectSocket(): RealtimeSocket {
  const socket = getSocketClient();
  socket.disconnect().connect();
  return socket;
}
