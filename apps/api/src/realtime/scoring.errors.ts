export class InactiveVoteSessionError extends Error {
  constructor() {
    super('The referee session is no longer active');
    this.name = InactiveVoteSessionError.name;
  }
}

export class DuplicateRefereeVoteError extends Error {
  constructor() {
    super('This referee has already voted in the current scoring window');
    this.name = DuplicateRefereeVoteError.name;
  }
}

export class MatchNotRunningForVoteError extends Error {
  constructor() {
    super('Votes are only accepted while a round is running');
    this.name = MatchNotRunningForVoteError.name;
  }
}

export class RoundPausedForVoteError extends Error {
  constructor() {
    super('Votes are not accepted while the round is paused');
    this.name = RoundPausedForVoteError.name;
  }
}

export class RoundEndedForVoteError extends Error {
  constructor() {
    super('The official round end time has passed');
    this.name = RoundEndedForVoteError.name;
  }
}

export class PriorScoringWindowPendingError extends Error {
  constructor() {
    super('A scoring window from the previous round is still pending');
    this.name = PriorScoringWindowPendingError.name;
  }
}

/** Referee-command scoring accepts votes only while the supervisor has a
 * scoring window open for the current stop. */
export class ScoringClosedForVoteError extends Error {
  constructor() {
    super('Votes are only accepted while the supervisor has scoring open');
    this.name = ScoringClosedForVoteError.name;
  }
}

/** The supervisor may only vote when the match round enabled supervisor scoring. */
export class SupervisorVoteDisabledError extends Error {
  constructor() {
    super('Supervisor scoring is not enabled for this match');
    this.name = SupervisorVoteDisabledError.name;
  }
}
