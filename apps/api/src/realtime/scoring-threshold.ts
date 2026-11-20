import { AthleteColor, ScoringThreshold } from '@prisma/client';

/**
 * The athlete awarded a resolved scoring stop, or null. `scorerCount` is every scorer of
 * the stop (judges + the supervisor "TT" when it votes), including those who did not vote.
 *
 * - MORE_THAN_HALF (default, and always for an odd count): the sport's majority rule.
 * - AT_LEAST_HALF with an even count: at least half of the scorers and more votes than the
 *   other athlete; a tie awards nothing.
 */
export function scoringStopWinner(input: {
  readonly blueVotes: number;
  readonly majority: (scorerCount: number) => number;
  readonly redVotes: number;
  readonly scorerCount: number;
  readonly threshold: ScoringThreshold;
}): AthleteColor | null {
  const { blueVotes, redVotes, scorerCount } = input;
  if (
    input.threshold === ScoringThreshold.AT_LEAST_HALF &&
    scorerCount % 2 === 0
  ) {
    const half = scorerCount / 2;
    if (redVotes >= half && redVotes > blueVotes) return AthleteColor.RED;
    if (blueVotes >= half && blueVotes > redVotes) return AthleteColor.BLUE;
    return null;
  }
  const needed = input.majority(scorerCount);
  if (redVotes >= needed) return AthleteColor.RED;
  if (blueVotes >= needed) return AthleteColor.BLUE;
  return null;
}
