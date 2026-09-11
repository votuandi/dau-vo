import type { AthleteColor, MatchAccessRole, MatchStatus, RefereeSlot } from './enums';

export const RealtimeEvent = {
  MATCH_STATE: 'match:state',
  MATCH_STATE_REQUEST: 'match:state:request',
  PUBLIC_MATCH_STATE: 'scoreboard:state',
  PUBLIC_MATCH_STATE_REQUEST: 'scoreboard:state:request',
  MATCH_FINISHED: 'match:finished',
  MATCH_RESET: 'match:reset',
  MATCH_RESET_COMPLETED: 'match:reset:completed',
  RESULT_CANCELLATION_UNDO: 'result-cancellation:undo',
  RESULT_CANCELLATION_UNDONE: 'result-cancellation:undone',
  PENALTY_ADD: 'penalty:add',
  PENALTY_ADDED: 'penalty:added',
  PRESENCE_UPDATED: 'presence:updated',
  ROUND_ENDED: 'round:ended',
  ROUND_CANCEL: 'round:cancel',
  ROUND_CANCELLED: 'round:cancelled',
  ROUND_PAUSE: 'round:pause',
  ROUND_PAUSED: 'round:paused',
  ROUND_RESUME: 'round:resume',
  ROUND_RESUMED: 'round:resumed',
  ROUND_START: 'round:start',
  ROUND_STARTED: 'round:started',
  SCORE_UPDATED: 'score:updated',
  SCORING_WINDOW_OPENED: 'scoring-window:opened',
  SCORING_WINDOW_RESOLVED: 'scoring-window:resolved',
  SESSION_REVOKED: 'session:revoked',
  VOTE_ACCEPTED: 'vote:accepted',
  VOTE_REJECTED: 'vote:rejected',
  VOTE_SUBMIT: 'vote:submit',
} as const;

export interface MatchPresenceEntry {
  accessRole: MatchAccessRole;
  activeSession: boolean;
  connected: boolean;
  connectedSocketCount: number;
}

export interface PresenceUpdatedPayload {
  matchPublicId: string;
  presence: MatchPresenceEntry[];
  scoreboardConnectedCount: number;
  updatedAt: string;
}

export interface MatchStartReadinessDetails {
  referee1Connected: boolean;
  referee2Connected: boolean;
  referee3Connected: boolean;
  scoreboardConnectedCount: number;
}

export interface MatchReadiness {
  canStartRound: boolean;
  missingRequirements: Array<'REFEREE_1' | 'REFEREE_2' | 'REFEREE_3' | 'SCOREBOARD'>;
  referees: {
    REFEREE_1: boolean;
    REFEREE_2: boolean;
    REFEREE_3: boolean;
  };
  scoreboardConnectedCount: number;
}

export interface MatchStateIdentity {
  currentRound: number | null;
  finishedAt: string | null;
  id: string;
  publicId: string;
  startedAt: string | null;
  status: MatchStatus;
}

export interface MatchRoundState {
  endedAt: string | null;
  endsAt: string;
  pausedAt: string | null;
  remainingDurationMs: number | null;
  id: string;
  roundNumber: 1 | 2;
  startedAt: string;
}

/**
 * The current unresolved voting window. This is match-wide state, so it is
 * safe to include in ordinary room broadcasts.
 */
export interface MatchScoringWindowState {
  endsAt: string;
  id: string;
  roundNumber: 1 | 2;
  startedAt: string;
}

export interface MatchStateAthlete {
  color: AthleteColor;
  id: string;
  name: string;
  organization: string;
  score: number;
  violations: number;
}

/**
 * State intended only for the authenticated recipient of a direct snapshot.
 * It must never be included in a room-wide `match:state` broadcast.
 */
export interface MatchStateViewer {
  acceptedVote: VoteAcceptedPayload | null;
}

export interface MatchStatePayload {
  activeRound: MatchRoundState | null;
  activeScoringWindow: MatchScoringWindowState | null;
  athletes: MatchStateAthlete[];
  generatedAt: string;
  match: MatchStateIdentity;
  presence: MatchPresenceEntry[];
  readiness: MatchReadiness;
  scoreboardConnectedCount: number;
  /** Present only on a direct `match:state:request` response. */
  viewer?: MatchStateViewer;
}

/**
 * Deliberately minimal state exposed to public scoreboards. It omits internal
 * database IDs, session/presence data, access codes, and referee vote details.
 */
export interface PublicMatchStatePayload {
  activeRound: MatchRoundState | null;
  athletes: Array<{
    color: AthleteColor;
    name: string;
    organization: string;
    score: number;
    violations: number;
  }>;
  generatedAt: string;
  match: Omit<MatchStateIdentity, 'id' | 'startedAt'>;
}

export interface RoundStartedPayload {
  matchPublicId: string;
  round: MatchRoundState;
  status: MatchStatus;
}

export interface RoundEndedPayload {
  matchPublicId: string;
  round: MatchRoundState;
  status: MatchStatus;
}

export interface RoundPausedPayload {
  matchPublicId: string;
  round: MatchRoundState;
  status: MatchStatus;
}

export type RoundResumedPayload = RoundPausedPayload;

export type RoundControlErrorCode =
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'ROUND_CONTROL_FAILED'
  | 'ROUND_CONTROL_FORBIDDEN'
  | 'ROUND_CONTROL_INVALID_STATE';

export type RoundControlResponse =
  | { ok: true; round: MatchRoundState }
  | { error: { code: RoundControlErrorCode; message: string }; ok: false };

export interface ResultCancellationPayload {
  actionId: string;
  matchPublicId: string;
  roundNumbers: Array<1 | 2>;
  status: MatchStatus;
}

export type ResultCancellationErrorCode =
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'RESULT_CANCELLATION_FAILED'
  | 'RESULT_CANCELLATION_FORBIDDEN'
  | 'RESULT_CANCELLATION_INVALID_STATE';

export type ResultCancellationResponse =
  | { action: ResultCancellationPayload; ok: true }
  | { error: { code: ResultCancellationErrorCode; message: string }; ok: false };

export interface ResultCancellationUndoPayload {
  matchPublicId: string;
  operationId: string;
  roundNumbers: Array<1 | 2>;
  status: MatchStatus;
}

export type ResultCancellationUndoErrorCode =
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'RESET_UNDO_FAILED'
  | 'RESET_UNDO_FORBIDDEN'
  | 'RESET_UNDO_NOT_ALLOWED';

export type ResultCancellationUndoResponse =
  | { ok: true; undo: ResultCancellationUndoPayload }
  | { error: { code: ResultCancellationUndoErrorCode; message: string }; ok: false };

export interface MatchFinishedPayload {
  finishedAt: string;
  matchPublicId: string;
}

export type RoundStartErrorCode =
  | 'MATCH_PARTICIPANTS_NOT_READY'
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'ROUND_START_FAILED'
  | 'ROUND_START_FORBIDDEN'
  | 'ROUND_START_INVALID_STATE';

export type RoundStartResponse =
  | {
      ok: true;
      round: MatchRoundState;
    }
  | {
      error: {
        code: RoundStartErrorCode;
        details?: MatchStartReadinessDetails;
        message: string;
      };
      ok: false;
    };

export interface VoteSubmitPayload {
  athlete: AthleteColor;
}

export type VoteSubmitErrorCode =
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'VOTE_ALREADY_SUBMITTED'
  | 'VOTE_FAILED'
  | 'VOTE_FORBIDDEN'
  | 'VOTE_INVALID_ATHLETE'
  | 'VOTE_MATCH_NOT_RUNNING'
  | 'ROUND_PAUSED'
  | 'VOTE_ROUND_ENDED'
  | 'VOTE_SCORING_WINDOW_PENDING';

export interface VoteSubmitError {
  code: VoteSubmitErrorCode;
  message: string;
}

export interface VoteAcceptedPayload {
  athlete: AthleteColor;
  matchPublicId: string;
  refereeSlot: RefereeSlot;
  scoringWindowId: string;
  serverReceivedAt: string;
}

export type VoteSubmitResponse =
  | {
      ok: true;
      vote: VoteAcceptedPayload;
    }
  | {
      error: VoteSubmitError;
      ok: false;
    };

export interface VoteRejectedPayload {
  error: VoteSubmitError;
  matchPublicId: string;
}

export interface ScoringWindowOpenedPayload {
  matchPublicId: string;
  window: {
    endsAt: string;
    id: string;
    roundNumber: 1 | 2;
    startedAt: string;
  };
}

export interface ScoringWindowResolvedPayload {
  matchPublicId: string;
  votes: Array<{
    athlete: AthleteColor;
    refereeSlot: RefereeSlot;
    serverReceivedAt: string;
  }>;
  window: {
    endsAt: string;
    id: string;
    resolvedAt: string;
    roundNumber: 1 | 2;
    scoreAwarded: boolean;
    startedAt: string;
    winningColor: AthleteColor | null;
  };
}

export interface ScoreUpdatedPayload {
  matchPublicId: string;
  scores: Array<{
    athleteId: string;
    color: AthleteColor;
    score: number;
  }>;
  penaltyId: string | null;
  scoringWindowId: string | null;
  updatedAt: string;
}

export interface PenaltyAddPayload {
  athlete: AthleteColor;
}

export type PenaltyAddErrorCode =
  | 'PENALTY_FAILED'
  | 'PENALTY_FORBIDDEN'
  | 'PENALTY_INVALID_ATHLETE'
  | 'PENALTY_MATCH_NOT_RUNNING'
  | 'PENALTY_ROUND_ENDED'
  | 'REALTIME_AUTHENTICATION_REQUIRED';

export interface PenaltyAddError {
  code: PenaltyAddErrorCode;
  message: string;
}

export interface PenaltyAddedPayload {
  matchPublicId: string;
  penalty: {
    athlete: AthleteColor;
    athleteId: string;
    createdAt: string;
    id: string;
    roundNumber: 1 | 2;
    value: number;
    violationCount: number;
  };
}

export type PenaltyAddResponse =
  { ok: true; penalty: PenaltyAddedPayload['penalty'] } | { error: PenaltyAddError; ok: false };

export interface SessionRevokedPayload {
  code: 'SESSION_REVOKED';
  message: string;
}
