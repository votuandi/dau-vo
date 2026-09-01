export const MATCH_SOCKET_PATH = '/api/socket.io';

export const REALTIME_AUTHENTICATION_ERROR = {
  code: 'REALTIME_AUTHENTICATION_REQUIRED',
  message: 'An active match session is required',
} as const;

export const SESSION_REVOKED_EVENT = {
  code: 'SESSION_REVOKED',
  message: 'Your match session is no longer active',
} as const;

export const ROUND_START_FORBIDDEN_ERROR = {
  code: 'ROUND_START_FORBIDDEN',
  message: 'Only the inspector may start a round',
} as const;

export const ROUND_START_INVALID_STATE_ERROR = {
  code: 'ROUND_START_INVALID_STATE',
  message: 'A round cannot be started from the current match state',
} as const;

export const ROUND_START_FAILED_ERROR = {
  code: 'ROUND_START_FAILED',
  message: 'The round could not be started',
} as const;

export const VOTE_FORBIDDEN_ERROR = {
  code: 'VOTE_FORBIDDEN',
  message: 'Only an active referee may submit a vote',
} as const;

export const VOTE_INVALID_ATHLETE_ERROR = {
  code: 'VOTE_INVALID_ATHLETE',
  message: 'Athlete must be RED or BLUE',
} as const;

export const VOTE_ALREADY_SUBMITTED_ERROR = {
  code: 'VOTE_ALREADY_SUBMITTED',
  message: 'This referee has already voted in the current scoring window',
} as const;

export const VOTE_MATCH_NOT_RUNNING_ERROR = {
  code: 'VOTE_MATCH_NOT_RUNNING',
  message: 'Votes are only accepted while a round is running',
} as const;

export const VOTE_ROUND_ENDED_ERROR = {
  code: 'VOTE_ROUND_ENDED',
  message: 'The official round end time has passed',
} as const;

export const VOTE_SCORING_WINDOW_PENDING_ERROR = {
  code: 'VOTE_SCORING_WINDOW_PENDING',
  message: 'The previous scoring window is still resolving',
} as const;

export const VOTE_FAILED_ERROR = {
  code: 'VOTE_FAILED',
  message: 'The vote could not be accepted',
} as const;

export const PENALTY_FORBIDDEN_ERROR = {
  code: 'PENALTY_FORBIDDEN',
  message: 'Only an active inspector may add a penalty',
} as const;

export const PENALTY_INVALID_ATHLETE_ERROR = {
  code: 'PENALTY_INVALID_ATHLETE',
  message: 'Athlete must be RED or BLUE',
} as const;

export const PENALTY_MATCH_NOT_RUNNING_ERROR = {
  code: 'PENALTY_MATCH_NOT_RUNNING',
  message: 'Penalties are only accepted while a round is running',
} as const;

export const PENALTY_ROUND_ENDED_ERROR = {
  code: 'PENALTY_ROUND_ENDED',
  message: 'The official round end time has passed',
} as const;

export const PENALTY_FAILED_ERROR = {
  code: 'PENALTY_FAILED',
  message: 'The penalty could not be recorded',
} as const;

export function matchRoom(publicMatchId: string): string {
  return `match:${publicMatchId}`;
}
