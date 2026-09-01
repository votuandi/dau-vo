import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@dau-vo/shared-types';
export type MatchSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketAudience = 'MATCH_SESSION' | 'PUBLIC' | 'ADMIN';
interface Options { audience: SocketAudience; publicMatchId: string; deviceId: string; sessionToken?: string; }
export function createMatchSocket({ audience, publicMatchId, deviceId, sessionToken }: Options): MatchSocket {
  return io<ServerToClientEvents, ClientToServerEvents>(import.meta.env.VITE_SOCKET_URL ?? window.location.origin, { path: '/socket.io', autoConnect: false, withCredentials: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500, reconnectionDelayMax: 8_000, randomizationFactor: 0.5, transports: ['websocket', 'polling'], auth: { audience, publicMatchId, deviceId, ...(sessionToken ? { token: sessionToken } : {}) } });
}
