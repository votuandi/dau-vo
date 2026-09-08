import type { AthleteColor, MatchAccessRole, MatchStatus, RefereeSlot } from './enums';

export const RealtimeEvent = {
  MATCH_STATE: 'match:state',
  MATCH_STATE_REQUEST: 'match:state:request',
  PUBLIC_MATCH_STATE: 'scoreboard:state',
  PUBLIC_MATCH_STATE_REQUEST: 'scoreboard:state:request',
  MATCH_FINISHED: 'match:finished',
  PENALTY_ADD: 'penalty:add',
  PENALTY_ADDED: 'penalty:added',
  PRESENCE_UPDATED: 'presence:updated',
  ROUND_ENDED: 'round:ended',
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
  updatedAt: string;
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

export interface MatchFinishedPayload {
  finishedAt: string;
  matchPublicId: string;
}

export type RoundStartErrorCode =
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
