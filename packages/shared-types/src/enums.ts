export enum AthleteColor {
  RED = 'RED',
  BLUE = 'BLUE',
}

export enum TournamentStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  FINISHED = 'FINISHED',
  ARCHIVED = 'ARCHIVED',
}

/** Detailed round/scoring phase. This is intentionally not match lifecycle. */
export enum MatchPhase {
  WAITING = 'WAITING',
  ROUND_1_RUNNING = 'ROUND_1_RUNNING',
  ROUND_1_PAUSED = 'ROUND_1_PAUSED',
  BREAK = 'BREAK',
  ROUND_2_RUNNING = 'ROUND_2_RUNNING',
  ROUND_2_PAUSED = 'ROUND_2_PAUSED',
  AWAITING_RESULT_SAVE = 'AWAITING_RESULT_SAVE',
  REGULATION_APPEAL = 'REGULATION_APPEAL',
  OVERTIME_READY = 'OVERTIME_READY',
  OVERTIME_RUNNING = 'OVERTIME_RUNNING',
  OVERTIME_PAUSED = 'OVERTIME_PAUSED',
  OVERTIME_APPEAL = 'OVERTIME_APPEAL',
  OVERTIME_TIEBREAK_DECISION = 'OVERTIME_TIEBREAK_DECISION',
  RESULT_PUBLICATION_READY = 'RESULT_PUBLICATION_READY',
  FINISHED = 'FINISHED',
}

/** @deprecated Use MatchPhase. Kept temporarily for source compatibility. */
export { MatchPhase as MatchStatus };

export enum MatchLifecycle {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUSPENDED = 'SUSPENDED',
  COMPLETED = 'COMPLETED',
}

/** Server-authoritative choices available when an inspector leaves a match. */
export enum MatchExitMode {
  CANCEL_RESULTS = 'CANCEL_RESULTS',
  SUSPEND_KEEP_ROUND_1 = 'SUSPEND_KEEP_ROUND_1',
  SUSPEND_KEEP_ROUNDS_1_AND_2 = 'SUSPEND_KEEP_ROUNDS_1_AND_2',
}

export enum MatchDisplayState {
  NOT_READY = 'NOT_READY',
  READY = 'READY',
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUSPENDED = 'SUSPENDED',
  COMPLETED = 'COMPLETED',
}

export enum MatchRole {
  REFEREE = 'REFEREE',
  INSPECTOR = 'INSPECTOR',
}

export enum TournamentOfficialRole {
  REFEREE = 'REFEREE',
  INSPECTOR = 'INSPECTOR',
}

export enum RefereeSlot {
  REFEREE_1 = 'REFEREE_1',
  REFEREE_2 = 'REFEREE_2',
  REFEREE_3 = 'REFEREE_3',
}

export enum MatchAccessRole {
  REFEREE_1 = 'REFEREE_1',
  REFEREE_2 = 'REFEREE_2',
  REFEREE_3 = 'REFEREE_3',
  INSPECTOR = 'INSPECTOR',
}
