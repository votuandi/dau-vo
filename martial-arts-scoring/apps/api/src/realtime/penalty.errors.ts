export class InactivePenaltySessionError extends Error {
  constructor() {
    super('The inspector session is no longer active');
    this.name = InactivePenaltySessionError.name;
  }
}

export class MatchNotRunningForPenaltyError extends Error {
  constructor() {
    super('Penalties are only accepted while a round is running');
    this.name = MatchNotRunningForPenaltyError.name;
  }
}

export class RoundEndedForPenaltyError extends Error {
  constructor() {
    super('The official round end time has passed');
    this.name = RoundEndedForPenaltyError.name;
  }
}
