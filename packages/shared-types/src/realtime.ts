import type {
  AthleteColor,
  MatchAccessRole,
  MatchLifecycle,
  MatchExitMode,
  MatchPhase,
  RefereeSlot,
} from './enums';

export const RealtimeEvent = {
  MATCH_STATE: 'match:state',
  MATCH_STATE_REQUEST: 'match:state:request',
  PUBLIC_MATCH_STATE: 'scoreboard:state',
  PUBLIC_MATCH_STATE_REQUEST: 'scoreboard:state:request',
  MATCH_FINISHED: 'match:finished',
  MATCH_COMPLETE: 'match:complete',
  APPEAL_COMPLETE: 'appeal:complete',
  OVERTIME_START: 'overtime:start',
  OVERTIME_RESTART: 'overtime:restart',
  OVERTIME_MANUAL_WINNER: 'overtime:manual-winner',
  RESULT_PUBLISH: 'result:publish',
  RESULT_PUBLISHED: 'result:published',
  MATCH_EXIT: 'match:exit',
  MATCH_COMPLETED: 'match:completed',
  MATCH_RESET: 'match:reset',
  MATCH_RESET_COMPLETED: 'match:reset:completed',
  RESULT_CANCELLATION_UNDO: 'result-cancellation:undo',
  RESULT_CANCELLATION_UNDONE: 'result-cancellation:undone',
  PENALTY_ADD: 'penalty:add',
  PENALTY_ADDED: 'penalty:added',
  FAULT_RECORD: 'fault:record',
  FAULT_RECORDED: 'fault:recorded',
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
  OFFICIAL_ASSIGNMENT_UPDATED: 'official:assignment-updated',
  OFFICIAL_STATUS_UPDATED: 'official:status-updated',
  MATCH_OFFICIALS_UPDATED: 'match:officials-updated',
  MATCH_ASSIGNMENT_RELEASED: 'match:assignment-released',
  OFFICIAL_ASSIGNMENT_SNAPSHOT_REQUEST: 'official:assignment-snapshot:request',
  OFFICIAL_ASSIGNMENT_SNAPSHOT: 'official:assignment-snapshot',
} as const;

export type MatchCompletionBlockedReason =
  | 'ALREADY_COMPLETED'
  | 'MATCH_SUSPENDED'
  | 'ROUND_1_NOT_ENDED'
  | 'ROUND_2_NOT_ENDED'
  | 'INVALIDATED_ROUND'
  | 'UNRESOLVED_SCORING_WINDOW'
  | 'NOT_AWAITING_RESULT_SAVE'
  | 'RESULT_DECISION_REQUIRED';

export interface MatchCompletionCapability {
  canComplete: boolean;
  blockedReasons: MatchCompletionBlockedReason[];
}

export type ResultCapabilityBlockedReason =
  | 'MATCH_SUSPENDED'
  | 'MATCH_COMPLETED'
  | 'NOT_REGULATION_APPEAL'
  | 'ROUND_SUMMARIES_MISSING'
  | 'UNRESOLVED_SCORING_WINDOW'
  | 'APPEAL_ALREADY_COMPLETED'
  | 'NOT_OVERTIME_READY'
  | 'NOT_AWAITING_PUBLICATION';
export interface RegulationScoreBreakdown {
  base: number;
  bonusPoints: number;
  penaltyPoints: number;
  final: number;
}
export interface AppealResultContext {
  canComplete: boolean;
  /** True only when breakdown is the committed adjustment for this exact scope. */
  committed: boolean;
  blockedReasons: ResultCapabilityBlockedReason[];
  breakdown: { RED: RegulationScoreBreakdown | null; BLUE: RegulationScoreBreakdown | null };
}

/** Result state is deliberately split by score scope. Overtime never borrows
 * regulation's base score, even when the athlete display score is cumulative. */
export interface ResultCapability {
  regulationAppeal: AppealResultContext;
  /** The active attempt while running, otherwise the most recently ended valid attempt. */
  currentOvertimeAttempt: RoundDescriptor | null;
  overtimeAppeal: AppealResultContext;
  tieBreak: {
    canStartOvertime: boolean;
    canRestartOvertime: boolean;
    canSelectManualWinner: boolean;
    isTie: boolean | null;
  };
  publication: {
    canPublish: boolean;
    blockedReasons: ResultCapabilityBlockedReason[];
    source: 'REGULATION' | 'OVERTIME' | null;
  };
}

export type MatchExitBlockedReason =
  | 'ALREADY_COMPLETED'
  | 'ROUND_1_NOT_ENDED'
  | 'ROUND_2_NOT_ENDED'
  | 'UNRESOLVED_SCORING_WINDOW'
  | 'NOT_ASSIGNED';

export interface MatchExitCapability {
  canExit: boolean;
  allowedModes: MatchExitMode[];
  blockedReasons: MatchExitBlockedReason[];
}

export interface OfficialAssignmentSnapshot {
  assignment: {
    id: string;
    match: { id: string; publicId: string; status: string };
    refereePosition: number | null;
    role: 'REFEREE' | 'INSPECTOR';
  } | null;
  official: { id: string; name: string; role: 'REFEREE' | 'INSPECTOR' };
  sessionId: string;
  status: 'IN_MATCH' | 'READY';
  tournament: { id: string; name: string; publicCode: string };
}

export interface OfficialAssignmentUpdatedPayload {
  assignment: OfficialAssignmentSnapshot['assignment'];
  officialId: string;
  tournamentId: string;
}

export interface MatchOfficialsUpdatedPayload {
  matchId: string;
  matchPublicId: string;
  tournamentId: string;
}

export interface MatchAssignmentReleasedPayload extends MatchOfficialsUpdatedPayload {
  releasedOfficialIds: string[];
}

export interface MatchPresenceEntry {
  accessRole: MatchAccessRole;
  activeSession: boolean;
  connected: boolean;
  connectedSocketCount: number;
}

export interface MatchOfficialPresenceEntry {
  activeSession: boolean;
  connected: boolean;
  connectedSocketCount: number;
  name: string;
  officialId: string;
  refereePosition: number | null;
  role: 'REFEREE' | 'INSPECTOR';
}

export interface PresenceUpdatedPayload {
  matchPublicId: string;
  officials: MatchOfficialPresenceEntry[];
  presence: MatchPresenceEntry[];
  scoreboardConnectedCount: number;
  updatedAt: string;
}

export interface MatchStartReadinessDetails {
  requiredRefereeCount: number;
  assignedRefereeCount: number;
  connectedRefereeCount: number;
  referees: Array<{
    officialId: string;
    name: string;
    position: number;
    assigned: boolean;
    connected: boolean;
  }>;
  inspector: { officialId: string | null; assigned: boolean; connected: boolean };
  missingRequirements: string[];
  scoreboardConnectedCount: number;
}

/** Safe, aggregate readiness state returned when a round start is rejected. */
export interface MatchParticipantsNotReadyDetails {
  requiredRefereeCount: number;
  assignedRefereeCount: number;
  connectedRefereeCount: number;
  scoreboardConnectedCount: number;
  inspectorConnected: boolean;
}

export interface LegacyMatchReadiness {
  kind: 'LEGACY_MATCH_ACCESS';
  canStartRound: boolean;
  missingRequirements: string[];
  requiredRefereeCount: number;
  referees: {
    REFEREE_1: boolean;
    REFEREE_2: boolean;
    REFEREE_3: boolean;
  };
  scoreboardConnectedCount: number;
}

export interface TournamentOfficialMatchReadiness extends MatchStartReadinessDetails {
  kind: 'TOURNAMENT_OFFICIALS';
  canStartRound: boolean;
}

export type MatchReadiness = LegacyMatchReadiness | TournamentOfficialMatchReadiness;

export interface MatchStateIdentity {
  currentRound: number | null;
  finishedAt: string | null;
  id: string;
  publicId: string;
  startedAt: string | null;
  lifecycle: MatchLifecycle;
  phase: MatchPhase;
  rulesVersion: 'LEGACY_SCORE_PENALTY_V1' | 'FAULT_APPEAL_OVERTIME_V2';
  /** @deprecated Use phase. */
  status: MatchPhase;
}

/** A round identity is deliberately not a number: overtime attempts are not
 * regulation rounds. `roundNumber` remains a temporary UI compatibility alias
 * and will be removed once legacy consoles render `descriptor` directly. */
export type RoundDescriptor =
  | { stage: 'REGULATION'; roundNumber: 1 | 2; attemptNumber: 0 }
  | { stage: 'OVERTIME'; roundNumber: number; attemptNumber: number };

export type MatchRoundState = RoundDescriptor & {
  endedAt: string | null;
  endsAt: string;
  pausedAt: string | null;
  remainingDurationMs: number | null;
  id: string;
  startedAt: string;
};

/**
 * The current unresolved voting window. This is match-wide state, so it is
 * safe to include in ordinary room broadcasts.
 */
export type MatchScoringWindowState = RoundDescriptor & {
  endsAt: string;
  id: string;
  startedAt: string;
};

export interface MatchStateAthlete {
  color: AthleteColor;
  id: string;
  name: string;
  organization: string | null;
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
  completion: MatchCompletionCapability;
  result: ResultCapability;
  exit: MatchExitCapability;
  generatedAt: string;
  match: MatchStateIdentity;
  presence: MatchPresenceEntry[];
  officials: MatchOfficialPresenceEntry[];
  readiness: MatchReadiness;
  scoreboardConnectedCount: number;
  /** Present only on a direct `match:state:request` response. */
  viewer?: MatchStateViewer;
}

export interface MatchExitCommandPayload {
  mode: MatchExitMode;
  /** Optional local-development correlation ID; it must not contain credentials. */
  traceId?: string;
}

export interface MatchExitPayload {
  matchPublicId: string;
  mode: MatchExitMode;
}
export type MatchExitResponse =
  | { ok: true; exit: MatchExitPayload }
  | {
      ok: false;
      error: {
        code:
          | 'MATCH_EXIT_FORBIDDEN'
          | 'MATCH_EXIT_INVALID_STATE'
          | 'MATCH_EXIT_FAILED'
          | 'REALTIME_AUTHENTICATION_REQUIRED';
        message: string;
      };
    };

/**
 * Deliberately minimal state exposed to public scoreboards. It omits internal
 * database IDs, session/presence data, access codes, and referee vote details.
 */
export interface PublicMatchStatePayload {
  activeRound: Omit<MatchRoundState, 'id'> | null;
  athletes: Array<{
    color: AthleteColor;
    name: string;
    organization: string | null;
    score: number;
    violations: number;
  }>;
  /** Committed score for the currently relevant result scope only. */
  committedScores: {
    source: 'REGULATION' | 'OVERTIME' | null;
    attemptNumber: number | null;
    RED: number | null;
    BLUE: number | null;
  };
  generatedAt: string;
  match: Omit<MatchStateIdentity, 'id' | 'startedAt'> & {
    outcome: {
      winner: AthleteColor;
      method: 'REGULATION_SCORE' | 'OVERTIME_SCORE' | 'MANUAL_AFTER_OVERTIME_TIE';
    } | null;
  };
}

export interface ResultPublishPayload {
  idempotencyKey: string;
  traceId?: string;
}
export interface ResultPublishedPayload {
  matchPublicId: string;
  outcome: {
    winner: AthleteColor;
    method: 'REGULATION_SCORE' | 'OVERTIME_SCORE' | 'MANUAL_AFTER_OVERTIME_TIE';
  };
  phase: 'FINISHED';
  finishedAt: string;
}
export type ResultPublishResponse =
  | { ok: true; publication: ResultPublishedPayload }
  | {
      ok: false;
      error: {
        code:
          | 'RESULT_PUBLISH_INVALID_PAYLOAD'
          | 'RESULT_PUBLISH_FORBIDDEN'
          | 'RESULT_PUBLISH_STALE_ASSIGNMENT'
          | 'RESULT_PUBLISH_INVALID_STATE'
          | 'RESULT_PUBLISH_CONFLICT'
          | 'RESULT_PUBLISH_FAILED'
          | 'REALTIME_AUTHENTICATION_REQUIRED';
        message: string;
        blockedReasons?: ResultCapabilityBlockedReason[];
      };
    };

export interface RoundStartedPayload {
  matchPublicId: string;
  round: MatchRoundState;
  status: MatchPhase;
}

export interface RoundEndedPayload {
  matchPublicId: string;
  round: MatchRoundState;
  status: MatchPhase;
}

export interface RoundPausedPayload {
  matchPublicId: string;
  round: MatchRoundState;
  status: MatchPhase;
}

export type RoundResumedPayload = RoundPausedPayload;

export type RoundControlErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
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
  status: MatchPhase;
}

export type ResultCancellationErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'RESULT_CANCELLATION_FAILED'
  | 'BRACKET_PROGRESSION_LOCKED'
  | 'RESULT_CANCELLATION_FORBIDDEN'
  | 'RESULT_CANCELLATION_INVALID_STATE';

export type ResultCancellationResponse =
  | { action: ResultCancellationPayload; ok: true }
  | { error: { code: ResultCancellationErrorCode; message: string }; ok: false };

export interface ResultCancellationUndoPayload {
  matchPublicId: string;
  operationId: string;
  roundNumbers: Array<1 | 2>;
  status: MatchPhase;
}

export type ResultCancellationUndoErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'RESET_UNDO_FAILED'
  | 'BRACKET_PROGRESSION_LOCKED'
  | 'RESET_UNDO_FORBIDDEN'
  | 'RESET_UNDO_NOT_ALLOWED';

export type ResultCancellationUndoResponse =
  | { ok: true; undo: ResultCancellationUndoPayload }
  | { error: { code: ResultCancellationUndoErrorCode; message: string }; ok: false };

export interface MatchFinishedPayload {
  finishedAt: string;
  matchPublicId: string;
}

export type MatchCompletionErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
  | 'MATCH_COMPLETION_NOT_READY'
  | 'MATCH_COMPLETION_FORBIDDEN'
  | 'MATCH_COMPLETION_STALE_ASSIGNMENT'
  | 'MATCH_ALREADY_COMPLETED'
  | 'MATCH_COMPLETION_SUSPENDED'
  | 'MATCH_COMPLETION_UNRESOLVED_ROUND'
  | 'MATCH_COMPLETION_BRACKET_CONFLICT'
  | 'BRACKET_PROGRESSION_LOCKED'
  | 'MATCH_COMPLETION_FAILED'
  | 'REALTIME_AUTHENTICATION_REQUIRED';

export type MatchCompletionResponse =
  | { ok: true; completed: MatchFinishedPayload }
  | { error: { code: MatchCompletionErrorCode; message: string }; ok: false };

export interface AppealCompletePayload {
  RED: { bonusPoints: number; penaltyPoints: number };
  BLUE: { bonusPoints: number; penaltyPoints: number };
  idempotencyKey: string;
  traceId?: string;
}
export interface AppealCompleteResult {
  appealId: string;
  matchPublicId: string;
  phase: MatchPhase;
  regulation?: { RED: RegulationScoreBreakdown; BLUE: RegulationScoreBreakdown };
  isTie: boolean;
}
export interface OvertimeActionResult {
  matchPublicId: string;
  phase: MatchPhase;
  attemptNumber: number;
  winner?: AthleteColor;
}
export type OvertimeActionResponse =
  | { ok: true; overtime: OvertimeActionResult }
  | {
      ok: false;
      error: {
        code:
          | 'OVERTIME_ACTION_FORBIDDEN'
          | 'OVERTIME_ACTION_INVALID_STATE'
          | 'OVERTIME_ACTION_FAILED'
          | 'REALTIME_AUTHENTICATION_REQUIRED';
        message: string;
      };
    };
export type AppealCompleteResponse =
  | { ok: true; appeal: AppealCompleteResult }
  | {
      ok: false;
      error: {
        code:
          | 'APPEAL_INVALID_PAYLOAD'
          | 'APPEAL_FORBIDDEN'
          | 'APPEAL_INVALID_STATE'
          | 'APPEAL_STALE_ASSIGNMENT'
          | 'APPEAL_IDEMPOTENCY_CONFLICT'
          | 'APPEAL_FAILED'
          | 'REALTIME_AUTHENTICATION_REQUIRED';
        message: string;
      };
    };

export type RoundStartErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
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
        details?: MatchParticipantsNotReadyDetails;
        message: string;
      };
      ok: false;
    };

export interface VoteSubmitPayload {
  athlete: AthleteColor;
}

export type VoteSubmitErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
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

interface VoteAcceptedPayloadBase {
  athlete: AthleteColor;
  matchPublicId: string;
  scoringWindowId: string;
  serverReceivedAt: string;
}

/**
 * The vote owner is deliberately discriminated: tournament assignments must
 * never be projected into the legacy three-slot identity.
 */
export type VoteAcceptedPayload =
  | (VoteAcceptedPayloadBase & {
      identity: { kind: 'legacy'; refereeSlot: RefereeSlot };
    })
  | (VoteAcceptedPayloadBase & {
      identity: {
        kind: 'official';
        assignmentId: string;
        refereePosition: number;
      };
    });

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
    assignmentId: string | null;
    refereePosition: number | null;
    refereeSlot?: RefereeSlot | null;
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

export interface FaultRecordPayload {
  athlete: AthleteColor;
  traceId?: string;
}
export type FaultRecordErrorCode =
  | 'REALTIME_AUTHENTICATION_REQUIRED'
  | 'FAULT_FORBIDDEN'
  | 'FAULT_STALE_ASSIGNMENT'
  | 'FAULT_INVALID_ATHLETE'
  | 'FAULT_ROUND_PAUSED'
  | 'FAULT_MATCH_NOT_RUNNING'
  | 'FAULT_ROUND_ENDED'
  | 'FAULT_INVALID_STATE'
  | 'FAULT_FAILED';
export interface FaultRecordError {
  code: FaultRecordErrorCode;
  message: string;
}
export interface FaultRecordedPayload {
  matchPublicId: string;
  fault: {
    athlete: AthleteColor;
    athleteId: string;
    createdAt: string;
    id: string;
    roundId: string;
  };
}
export type FaultRecordResponse =
  { ok: true; fault: FaultRecordedPayload['fault'] } | { ok: false; error: FaultRecordError };

export type PenaltyAddErrorCode =
  | 'SPORT_GROUP_RULES_NOT_IMPLEMENTED'
  | 'PENALTY_FAILED'
  | 'PENALTY_FORBIDDEN'
  | 'PENALTY_INVALID_ATHLETE'
  | 'PENALTY_LEGACY_ONLY'
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
