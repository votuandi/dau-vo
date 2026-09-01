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
