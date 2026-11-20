import { AthleteColor, ScoringThreshold } from '@prisma/client';
import { scoringStopWinner } from './scoring-threshold';

const majority = (count: number) => Math.floor(count / 2) + 1;

function winner(
  scorerCount: number,
  redVotes: number,
  blueVotes: number,
  threshold: ScoringThreshold,
) {
  return scoringStopWinner({
    blueVotes,
    majority,
    redVotes,
    scorerCount,
    threshold,
  });
}

describe('scoringStopWinner', () => {
  it.each([
    // [scorers, red, blue, expected]
    [4, 3, 1, AthleteColor.RED],
    [4, 2, 1, null],
    [4, 2, 2, null],
    [2, 1, 0, null],
    [2, 2, 0, AthleteColor.RED],
    [3, 2, 1, AthleteColor.RED],
    [3, 1, 1, null],
  ] as const)(
    'more than half: %i scorers, %i red, %i blue → %s',
    (scorers, red, blue, expected) => {
      expect(winner(scorers, red, blue, ScoringThreshold.MORE_THAN_HALF)).toBe(
        expected,
      );
    },
  );

  it.each([
    [4, 2, 1, AthleteColor.RED],
    [4, 1, 2, AthleteColor.BLUE],
    [4, 2, 0, AthleteColor.RED],
    // At least half but not more than the other athlete: a tie awards nothing.
    [4, 2, 2, null],
    [4, 1, 1, null],
    [2, 1, 0, AthleteColor.RED],
    [2, 1, 1, null],
    [6, 3, 2, AthleteColor.RED],
    [6, 2, 1, null],
  ] as const)(
    'at least half: %i scorers, %i red, %i blue → %s',
    (scorers, red, blue, expected) => {
      expect(winner(scorers, red, blue, ScoringThreshold.AT_LEAST_HALF)).toBe(
        expected,
      );
    },
  );

  it.each([
    [3, 1, 0],
    [5, 2, 1],
  ] as const)(
    'treats an odd scorer count the same under both rules (%i scorers, %i red, %i blue)',
    (scorers, red, blue) => {
      expect(winner(scorers, red, blue, ScoringThreshold.AT_LEAST_HALF)).toBe(
        winner(scorers, red, blue, ScoringThreshold.MORE_THAN_HALF),
      );
    },
  );
});
