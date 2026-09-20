import type {
  MatchFinishedPayload,
  MatchCompletionResponse,
  MatchExitMode,
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
  MatchAssignmentReleasedPayload,
  MatchOfficialsUpdatedPayload,
  VoteAcceptedPayload,
  VoteRejectedPayload,
  VoteSubmitPayload,
  VoteSubmitResponse,
} from '@martial-arts-scoring/shared-types';

export interface ServerToClientEvents {
  'official:assignment-snapshot': (payload: OfficialAssignmentSnapshot) => void;
  'official:assignment-updated': (payload: OfficialAssignmentUpdatedPayload) => void;
  'match:assignment-released': (payload: MatchAssignmentReleasedPayload) => void;
  'match:officials-updated': (payload: MatchOfficialsUpdatedPayload) => void;
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
  'result-cancellation:undone': (payload: ResultCancellationUndoPayload) => void;
  'score:updated': (payload: ScoreUpdatedPayload) => void;
  'scoring-window:opened': (payload: ScoringWindowOpenedPayload) => void;
  'scoring-window:resolved': (payload: ScoringWindowResolvedPayload) => void;
  'session:revoked': (payload: SessionRevokedPayload) => void;
  'vote:accepted': (payload: VoteAcceptedPayload) => void;
  'vote:rejected': (payload: VoteRejectedPayload) => void;
}

export interface ClientToServerEvents {
  'official:assignment-snapshot:request': () => void;
  'match:state:request': () => void;
  'scoreboard:state:request': () => void;
  'penalty:add': (
    payload: PenaltyAddPayload,
    acknowledge: (response: PenaltyAddResponse) => void,
  ) => void;
  'round:start': (acknowledge: (response: RoundStartResponse) => void) => void;
  'round:pause': (acknowledge: (response: RoundControlResponse) => void) => void;
  'round:resume': (acknowledge: (response: RoundControlResponse) => void) => void;
  'round:cancel': (acknowledge: (response: ResultCancellationResponse) => void) => void;
  'match:reset': (acknowledge: (response: ResultCancellationResponse) => void) => void;
  'match:complete': (acknowledge: (response: MatchCompletionResponse) => void) => void;
  'match:exit': (payload: { mode: MatchExitMode }, acknowledge: (response: MatchExitResponse) => void) => void;
  'result-cancellation:undo': (
    payload: { operationId: string },
    acknowledge: (response: ResultCancellationUndoResponse) => void,
  ) => void;
  'vote:submit': (
    payload: VoteSubmitPayload,
    acknowledge: (response: VoteSubmitResponse) => void,
  ) => void;
}
