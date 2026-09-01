import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { type ApiErrorBody, type AthleteColor, type CommandAck, type MatchSnapshot, type PenaltyAddCommand, type RoundStartCommand, type VoteAcceptedPayload, type VoteSubmitCommand } from '@dau-vo/shared-types';
import { createMatchSocket, type MatchSocket, type SocketAudience } from '@/services/socket/create-match-socket';
import { useClientSessionStore } from '@/stores/client-session-store';
import { createCommandId } from '@/lib/utils';
import { createInitialRealtimeState, realtimeMatchReducer, type RealtimeMatchAction, type RealtimeMatchState } from './realtime-match-reducer';

const ACK_TIMEOUT_MS = 5_000;
const connectionError: ApiErrorBody = { code: 'INTERNAL_ERROR', message: 'Realtime connection unavailable' };
interface Value extends RealtimeMatchState { requestSnapshot: () => void; submitVote: (color: AthleteColor) => Promise<CommandAck<VoteAcceptedPayload>>; startRound: () => Promise<CommandAck<MatchSnapshot>>; addPenalty: (color: AthleteColor) => Promise<CommandAck<MatchSnapshot>>; }
const Context = createContext<Value | null>(null);
interface Props { audience: SocketAudience; publicMatchId: string; initialSnapshot?: MatchSnapshot | null; children: ReactNode; }

export function RealtimeMatchProvider({ audience, publicMatchId, initialSnapshot = null, children }: Props) {
  const sessionToken = useClientSessionStore((state) => state.matchSession?.sessionToken);
  const deviceId = useClientSessionStore((state) => state.deviceId);
  const clearSession = useClientSessionStore((state) => state.clearMatchSession);
  const [state, dispatch] = useReducer(realtimeMatchReducer, initialSnapshot, createInitialRealtimeState);
  const socketRef = useRef<MatchSocket | null>(null);

  const requestSnapshot = useCallback(() => {
    const socket = socketRef.current; if (!socket?.connected) return;
    let settled = false;
    const timer = window.setTimeout(() => { if (!settled) { settled = true; dispatch({ type: 'SYNC_FAILED', error: connectionError }); } }, ACK_TIMEOUT_MS);
    socket.emit('match:state:request', (ack) => { if (settled) return; settled = true; window.clearTimeout(timer); if (ack.ok && ack.data) dispatch({ type: 'SNAPSHOT_RECEIVED', snapshot: ack.data, receivedAt: Date.now() }); else dispatch({ type: 'SYNC_FAILED', error: ack.error ?? connectionError }); });
  }, []);

  useEffect(() => {
    let active = true;
    const socket = createMatchSocket({ audience, publicMatchId, deviceId, ...(audience === 'MATCH_SESSION' && sessionToken ? { sessionToken } : {}) }); socketRef.current = socket;
    const snapshot = (value: MatchSnapshot) => { if (active) dispatch({ type: 'SNAPSHOT_RECEIVED', snapshot: value, receivedAt: Date.now() }); };
    const connect = () => { if (active) { dispatch({ type: 'SOCKET_CONNECTED' }); requestSnapshot(); } };
    const disconnect = () => { if (active) dispatch({ type: 'DISCONNECTED' }); };
    const reconnecting = () => { if (active) dispatch({ type: 'CONNECTING', reconnecting: true }); };
    const error = (value: ApiErrorBody = connectionError) => { if (active) dispatch({ type: 'SYNC_FAILED', error: value }); };
    socket.on('connect', connect); socket.on('disconnect', disconnect); socket.io.on('reconnect_attempt', reconnecting); socket.on('connect_error', () => error());
    socket.on('match:state', snapshot); socket.on('match:updated', snapshot); socket.on('round:started', snapshot); socket.on('round:ended', snapshot); socket.on('scoring-window:opened', snapshot); socket.on('score:updated', snapshot); socket.on('penalty:added', snapshot); socket.on('match:finished', snapshot);
    socket.on('presence:updated', (presence) => { if (active) dispatch({ type: 'PRESENCE_RECEIVED', presence }); });
    socket.on('vote:accepted', (payload) => { if (active) dispatch({ type: 'VOTE_ACCEPTED', payload }); });
    socket.on('vote:rejected', (value) => { if (active) dispatch({ type: 'COMMAND_REJECTED', error: value }); });
    socket.on('scoring-window:resolved', (payload) => { if (active) dispatch({ type: 'WINDOW_RESOLVED', scoringWindowId: payload.scoringWindowId, snapshot: payload.snapshot }); });
    socket.on('session:revoked', (payload) => { if (!active) return; dispatch({ type: 'SESSION_REVOKED', payload }); clearSession('Phiên đăng nhập đã được chuyển sang thiết bị khác.'); socket.disconnect(); });
    socket.on('error', error);
    dispatch({ type: 'CONNECTING', reconnecting: false }); socket.connect();
    const visible = () => { if (document.visibilityState === 'visible' && socket.connected) requestSnapshot(); };
    window.addEventListener('online', requestSnapshot); document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.removeEventListener('online', requestSnapshot); document.removeEventListener('visibilitychange', visible); socket.removeAllListeners(); socket.io.removeAllListeners(); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [audience, clearSession, deviceId, publicMatchId, requestSnapshot, sessionToken]);

  const submitVote = useCallback((athleteColor: AthleteColor) => {
    const command: VoteSubmitCommand = { commandId: createCommandId(), athleteColor, clientPressedAt: new Date().toISOString() };
    dispatch({ type: 'COMMAND_PENDING', id: command.commandId, kind: 'VOTE', color: athleteColor });
    return emitWithAck<VoteAcceptedPayload>((ack) => socketRef.current?.emit('vote:submit', command, ack), state.connection, dispatch, (data) => dispatch({ type: 'VOTE_ACCEPTED', payload: data }));
  }, [state.connection]);
  const startRound = useCallback(() => { const command: RoundStartCommand = { commandId: createCommandId() }; dispatch({ type: 'COMMAND_PENDING', id: command.commandId, kind: 'ROUND_START' }); return emitWithAck<MatchSnapshot>((ack) => socketRef.current?.emit('round:start', command, ack), state.connection, dispatch, (data) => dispatch({ type: 'SNAPSHOT_RECEIVED', snapshot: data, receivedAt: Date.now() })); }, [state.connection]);
  const addPenalty = useCallback((athleteColor: AthleteColor) => { const command: PenaltyAddCommand = { commandId: createCommandId(), athleteColor }; dispatch({ type: 'COMMAND_PENDING', id: command.commandId, kind: 'PENALTY', color: athleteColor }); return emitWithAck<MatchSnapshot>((ack) => socketRef.current?.emit('penalty:add', command, ack), state.connection, dispatch, (data) => dispatch({ type: 'SNAPSHOT_RECEIVED', snapshot: data, receivedAt: Date.now() })); }, [state.connection]);
  const value = useMemo<Value>(() => ({ ...state, requestSnapshot, submitVote, startRound, addPenalty }), [addPenalty, requestSnapshot, startRound, state, submitVote]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function emitWithAck<T>(emit: (ack: (result: CommandAck<T>) => void) => void, connection: RealtimeMatchState['connection'], dispatch: Dispatch<RealtimeMatchAction>, onAccepted: (data: T) => void): Promise<CommandAck<T>> {
  return new Promise((resolve) => {
    if (connection !== 'CONNECTED') { dispatch({ type: 'COMMAND_REJECTED', error: connectionError }); resolve({ ok: false, error: connectionError }); return; }
    let settled = false; const timer = window.setTimeout(() => { if (!settled) { settled = true; dispatch({ type: 'COMMAND_REJECTED', error: connectionError }); resolve({ ok: false, error: connectionError }); } }, ACK_TIMEOUT_MS);
    emit((ack) => { if (settled) return; settled = true; window.clearTimeout(timer); if (ack.ok && ack.data) { onAccepted(ack.data); dispatch({ type: 'COMMAND_FINISHED' }); } else dispatch({ type: 'COMMAND_REJECTED', error: ack.error ?? connectionError }); resolve(ack); });
  });
}

export function useRealtimeMatch(): Value { const value = useContext(Context); if (!value) throw new Error('useRealtimeMatch must be used within RealtimeMatchProvider'); return value; }
