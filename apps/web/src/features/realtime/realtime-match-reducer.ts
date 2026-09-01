import type { ApiErrorBody, AthleteColor, MatchSnapshot, PresenceSnapshot, SessionRevokedPayload, VoteAcceptedPayload } from '@dau-vo/shared-types';
export type ConnectionPhase = 'IDLE' | 'CONNECTING' | 'SYNCING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'REVOKED';
export type CommandKind = 'VOTE' | 'ROUND_START' | 'PENALTY';
export interface RealtimeMatchState { connection: ConnectionPhase; snapshot: MatchSnapshot | null; clockOffsetMs: number; staleSince: number | null; lastError: ApiErrorBody | null; pendingCommand: { id: string; kind: CommandKind; color?: AthleteColor } | null; acceptedVote: VoteAcceptedPayload | null; revoked: SessionRevokedPayload | null; }
export function createInitialRealtimeState(snapshot: MatchSnapshot | null = null): RealtimeMatchState { return { connection: 'IDLE', snapshot, clockOffsetMs: snapshot ? Date.parse(snapshot.serverNow) - Date.now() : 0, staleSince: null, lastError: null, pendingCommand: null, acceptedVote: null, revoked: null }; }
export type RealtimeMatchAction = { type: 'CONNECTING'; reconnecting: boolean } | { type: 'SOCKET_CONNECTED' } | { type: 'SNAPSHOT_RECEIVED'; snapshot: MatchSnapshot; receivedAt: number } | { type: 'PRESENCE_RECEIVED'; presence: PresenceSnapshot } | { type: 'DISCONNECTED' } | { type: 'SYNC_FAILED'; error: ApiErrorBody } | { type: 'COMMAND_PENDING'; id: string; kind: CommandKind; color?: AthleteColor } | { type: 'COMMAND_REJECTED'; error: ApiErrorBody } | { type: 'COMMAND_FINISHED' } | { type: 'VOTE_ACCEPTED'; payload: VoteAcceptedPayload } | { type: 'WINDOW_RESOLVED'; scoringWindowId: string; snapshot: MatchSnapshot } | { type: 'SESSION_REVOKED'; payload: SessionRevokedPayload };
const timestamp = (snapshot: MatchSnapshot) => { const value = Date.parse(snapshot.serverNow); return Number.isNaN(value) ? 0 : value; };
export function realtimeMatchReducer(state: RealtimeMatchState, action: RealtimeMatchAction): RealtimeMatchState {
  switch (action.type) {
    case 'CONNECTING': return { ...state, connection: action.reconnecting ? 'RECONNECTING' : 'CONNECTING', staleSince: state.snapshot ? state.staleSince ?? Date.now() : null };
    case 'SOCKET_CONNECTED': return { ...state, connection: 'SYNCING', lastError: null };
    case 'SNAPSHOT_RECEIVED': { if (state.snapshot && timestamp(action.snapshot) < timestamp(state.snapshot)) return state; const activeId = action.snapshot.activeScoringWindow?.id; const acceptedVote = state.acceptedVote && activeId === state.acceptedVote.scoringWindowId ? state.acceptedVote : null; return { ...state, connection: 'CONNECTED', snapshot: action.snapshot, clockOffsetMs: timestamp(action.snapshot) - action.receivedAt, staleSince: null, lastError: null, acceptedVote }; }
    case 'PRESENCE_RECEIVED': return state.snapshot ? { ...state, snapshot: { ...state.snapshot, presence: action.presence } } : state;
    case 'DISCONNECTED': return { ...state, connection: 'DISCONNECTED', staleSince: state.staleSince ?? Date.now(), pendingCommand: null };
    case 'SYNC_FAILED': return { ...state, connection: state.snapshot ? 'RECONNECTING' : 'DISCONNECTED', staleSince: state.snapshot ? state.staleSince ?? Date.now() : null, lastError: action.error };
    case 'COMMAND_PENDING': return { ...state, pendingCommand: { id: action.id, kind: action.kind, ...(action.color ? { color: action.color } : {}) }, lastError: null };
    case 'COMMAND_REJECTED': return { ...state, pendingCommand: null, lastError: action.error };
    case 'COMMAND_FINISHED': return { ...state, pendingCommand: null };
    case 'VOTE_ACCEPTED': return { ...state, pendingCommand: state.pendingCommand?.id === action.payload.commandId ? null : state.pendingCommand, acceptedVote: action.payload, lastError: null };
    case 'WINDOW_RESOLVED': return { ...state, snapshot: action.snapshot, clockOffsetMs: timestamp(action.snapshot) - Date.now(), acceptedVote: state.acceptedVote?.scoringWindowId === action.scoringWindowId ? null : state.acceptedVote };
    case 'SESSION_REVOKED': return { ...state, connection: 'REVOKED', revoked: action.payload, pendingCommand: null, acceptedVote: null };
  }
}
