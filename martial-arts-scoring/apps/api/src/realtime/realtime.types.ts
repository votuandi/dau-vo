import type {
  MatchFinishedPayload,
  MatchStatePayload,
  PublicMatchStatePayload,
  PenaltyAddedPayload,
  PenaltyAddPayload,
  PenaltyAddResponse,
  PresenceUpdatedPayload,
  RoundEndedPayload,
  RoundStartedPayload,
  RoundStartResponse,
  ScoreUpdatedPayload,
  ScoringWindowOpenedPayload,
  ScoringWindowResolvedPayload,
  SessionRevokedPayload,
  VoteAcceptedPayload,
  VoteRejectedPayload,
  VoteSubmitPayload,
  VoteSubmitResponse,
} from '@martial-arts-scoring/shared-types';
import type { MatchAccessRole } from '@prisma/client';
import type { MatchRole, RefereeSlot } from '@prisma/client';
import type { Socket } from 'socket.io';

export interface ClientToServerEvents {
  'match:state:request': () => void;
  'scoreboard:state:request': () => void;
  'penalty:add': (
    payload: PenaltyAddPayload,
    acknowledge: (response: PenaltyAddResponse) => void,
  ) => void;
  'round:start': (acknowledge: (response: RoundStartResponse) => void) => void;
  'vote:submit': (
    payload: VoteSubmitPayload,
    acknowledge: (response: VoteSubmitResponse) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'match:finished': (payload: MatchFinishedPayload) => void;
  'match:state': (payload: MatchStatePayload) => void;
  'scoreboard:state': (payload: PublicMatchStatePayload) => void;
  'penalty:added': (payload: PenaltyAddedPayload) => void;
  'presence:updated': (payload: PresenceUpdatedPayload) => void;
  'round:ended': (payload: RoundEndedPayload) => void;
  'round:started': (payload: RoundStartedPayload) => void;
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
  connectionKind?: 'participant' | 'scoreboard';
  scoreboardMatchPublicId?: string;
}

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;
