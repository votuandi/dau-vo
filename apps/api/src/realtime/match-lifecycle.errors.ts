import type { MatchStatus } from '@prisma/client';

export class InvalidRoundStartStateError extends Error {
  constructor(readonly status: MatchStatus) {
    super(`A round cannot be started while the match is ${status}`);
    this.name = InvalidRoundStartStateError.name;
  }
}

export class InactiveRoundStartSessionError extends Error {
  constructor() {
    super('The inspector session is no longer active');
    this.name = InactiveRoundStartSessionError.name;
  }
}

export class InvalidRoundControlStateError extends Error {
  constructor(readonly status: MatchStatus) {
    super(`The round cannot be paused or resumed while the match is ${status}`);
    this.name = InvalidRoundControlStateError.name;
  }
}

export class InactiveRoundControlSessionError extends Error {
  constructor() {
    super('The inspector session is no longer active');
    this.name = InactiveRoundControlSessionError.name;
  }
}

export class InvalidResultCancellationStateError extends Error {
  constructor(readonly status: MatchStatus) {
    super(`Results cannot be cancelled while the match is ${status}`);
    this.name = InvalidResultCancellationStateError.name;
  }
}

export class ResultCancellationUndoNotAllowedError extends Error {
  constructor() {
    super('The result cancellation can no longer be undone safely');
    this.name = ResultCancellationUndoNotAllowedError.name;
  }
}

export class MatchLifecycleTargetMissingError extends Error {
  constructor() {
    super('The match no longer exists for lifecycle processing');
    this.name = MatchLifecycleTargetMissingError.name;
  }
}

export class MatchParticipantsNotReadyError extends Error {
  constructor() {
    super('Required officials or scoreboard are not connected');
    this.name = MatchParticipantsNotReadyError.name;
  }
}
