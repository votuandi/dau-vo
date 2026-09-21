import type {
  MatchFinishedPayload,
  MatchCompletionResponse,
  MatchExitCommandPayload,
  MatchExitResponse,
  MatchStatePayload,
  PublicMatchStatePayload,
  PenaltyAddedPayload,
  PenaltyAddPayload,
  PenaltyAddResponse,
  PresenceUpdatedPayload,
  RoundEndedPayload,
  RoundStartedPayload,
  RoundPausedPayload,
  RoundResumedPayload,
  RoundControlResponse,
  ResultCancellationPayload,
  ResultCancellationResponse,
  ResultCancellationUndoPayload,
  ResultCancellationUndoResponse,
  RoundStartResponse,
  ScoreUpdatedPayload,
  ScoringWindowOpenedPayload,
  ScoringWindowResolvedPayload,
  SessionRevokedPayload,
  OfficialAssignmentSnapshot,
  OfficialAssignmentUpdatedPayload,
  MatchOfficialsUpdatedPayload,
  MatchAssignmentReleasedPayload,
  VoteAcceptedPayload,
  VoteRejectedPayload,
  VoteSubmitPayload,
  VoteSubmitResponse,
} from '@martial-arts-scoring/shared-types';
import type { MatchAccessRole } from '@prisma/client';
import type { MatchRole, RefereeSlot } from '@prisma/client';
import type { Socket } from 'socket.io';

export interface ClientToServerEvents {
  'official:assignment-snapshot:request': () => void;
  'match:state:request': () => void;
  'scoreboard:state:request': () => void;
  'penalty:add': (
    payload: PenaltyAddPayload,
    acknowledge: (response: PenaltyAddResponse) => void,
  ) => void;
  'round:start': (acknowledge: (response: RoundStartResponse) => void) => void;
  'round:pause': (
    acknowledge: (response: RoundControlResponse) => void,
  ) => void;
  'round:resume': (
    acknowledge: (response: RoundControlResponse) => void,
  ) => void;
  'round:cancel': (
    acknowledge: (response: ResultCancellationResponse) => void,
  ) => void;
  'match:reset': (
    acknowledge: (response: ResultCancellationResponse) => void,
  ) => void;
  'match:complete': (
    acknowledge: (response: MatchCompletionResponse) => void,
  ) => void;
  'match:exit': (
    payload: MatchExitCommandPayload,
    acknowledge: (response: MatchExitResponse) => void,
  ) => void;
  'result-cancellation:undo': (
    payload: { operationId: string },
    acknowledge: (response: ResultCancellationUndoResponse) => void,
  ) => void;
  'vote:submit': (
    payload: VoteSubmitPayload,
    acknowledge: (response: VoteSubmitResponse) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'official:assignment-snapshot': (payload: OfficialAssignmentSnapshot) => void;
  'official:assignment-updated': (
    payload: OfficialAssignmentUpdatedPayload,
  ) => void;
  'official:status-updated': (
    payload: Pick<OfficialAssignmentSnapshot, 'official' | 'status'>,
  ) => void;
  'match:officials-updated': (payload: MatchOfficialsUpdatedPayload) => void;
  'match:assignment-released': (
    payload: MatchAssignmentReleasedPayload,
  ) => void;
  'match:finished': (payload: MatchFinishedPayload) => void;
  'match:completed': (payload: MatchFinishedPayload) => void;
  'match:state': (payload: MatchStatePayload) => void;
  'scoreboard:state': (payload: PublicMatchStatePayload) => void;
  'penalty:added': (payload: PenaltyAddedPayload) => void;
  'presence:updated': (payload: PresenceUpdatedPayload) => void;
  'round:ended': (payload: RoundEndedPayload) => void;
  'round:started': (payload: RoundStartedPayload) => void;
  'round:paused': (payload: RoundPausedPayload) => void;
  'round:resumed': (payload: RoundResumedPayload) => void;
  'round:cancelled': (payload: ResultCancellationPayload) => void;
  'match:reset:completed': (payload: ResultCancellationPayload) => void;
  'result-cancellation:undone': (
    payload: ResultCancellationUndoPayload,
  ) => void;
  'score:updated': (payload: ScoreUpdatedPayload) => void;
  'scoring-window:opened': (payload: ScoringWindowOpenedPayload) => void;
  'scoring-window:resolved': (payload: ScoringWindowResolvedPayload) => void;
  'session:revoked': (payload: SessionRevokedPayload) => void;
  'vote:accepted': (payload: VoteAcceptedPayload) => void;
  'vote:rejected': (payload: VoteRejectedPayload) => void;
}

export interface RealtimeSocketIdentity {
  deviceId: string;
  matchId: string;
  publicMatchId: string;
  refereeSlot: RefereeSlot | null;
  role: MatchRole;
  sessionId: string;
}

export interface RealtimeSocketData {
  accessRole?: MatchAccessRole;
  identity?: RealtimeSocketIdentity;
  matchSessionToken?: string;
  revoked?: boolean;
  connectionKind?: 'participant' | 'scoreboard' | 'official';
  scoreboardMatchPublicId?: string;
  officialSessionToken?: string;
  officialIdentity?: {
    officialId: string;
    sessionId: string;
    tournamentId: string;
  };
  officialMatchPublicId?: string;
}

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;
