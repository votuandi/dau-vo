import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { RealtimeEvent, type PublicMatchStatePayload } from '@martial-arts-scoring/shared-types';
import { appEnv } from '@/config/env';

export type ScoreboardConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface ScoreboardClientEvents {
  'scoreboard:state:request': () => void;
}

interface ScoreboardServerEvents {
  'scoreboard:state': (payload: PublicMatchStatePayload) => void;
}

export interface ScoreboardRealtimeState {
  readonly connectionStatus: ScoreboardConnectionStatus;
  readonly snapshot: PublicMatchStatePayload | null;
}

/** A dedicated unauthenticated, read-only socket; it never shares participant cookies/state. */
export function useScoreboardRealtime(matchPublicId: string): ScoreboardRealtimeState {
  const [connectionStatus, setConnectionStatus] =
    useState<ScoreboardConnectionStatus>('connecting');
  const [snapshot, setSnapshot] = useState<PublicMatchStatePayload | null>(null);
  const socketRef = useRef<Socket<ScoreboardServerEvents, ScoreboardClientEvents> | null>(null);

  useEffect(() => {
    setConnectionStatus('connecting');
    setSnapshot(null);

    const options = {
      auth: { matchPublicId, mode: 'scoreboard' },
      path: appEnv.socketPath,
      transports: ['websocket', 'polling'],
    };
    const socket = appEnv.socketUrl ? io(appEnv.socketUrl, options) : io(options);
    socketRef.current = socket;

    const requestSnapshot = (): void => {
      socket.emit(RealtimeEvent.PUBLIC_MATCH_STATE_REQUEST);
    };
    const onConnect = (): void => {
      setConnectionStatus('connected');
      requestSnapshot();
    };
    const onDisconnect = (): void => {
      setConnectionStatus('disconnected');
    };
    const onConnectError = (): void => {
      setConnectionStatus('disconnected');
    };
    const onSnapshot = (payload: PublicMatchStatePayload): void => {
      setSnapshot(payload);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on(RealtimeEvent.PUBLIC_MATCH_STATE, onSnapshot);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off(RealtimeEvent.PUBLIC_MATCH_STATE, onSnapshot);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchPublicId]);

  return { connectionStatus, snapshot };
}
