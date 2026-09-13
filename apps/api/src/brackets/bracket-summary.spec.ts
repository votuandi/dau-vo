import { summarizeBracket } from './bracket-summary';

describe('summarizeBracket', () => {
  it.each([
    [2, 2, 1, 1, 1, 0],
    [3, 4, 2, 2, 1, 1],
    [5, 8, 3, 4, 1, 3],
    [29, 32, 5, 28, 13, 3],
    [31, 32, 5, 30, 15, 1],
    [32, 32, 5, 31, 16, 0],
    [33, 64, 6, 32, 1, 31],
    [64, 64, 6, 63, 32, 0],
  ])(
    '%i athletes',
    (
      athleteCount,
      bracketSize,
      roundCount,
      totalFixtureCount,
      firstRoundFixtureCount,
      byeCount,
    ) => {
      expect(summarizeBracket(athleteCount)).toEqual({
        athleteCount,
        bracketSize,
        roundCount,
        totalFixtureCount,
        firstRoundFixtureCount,
        byeCount,
      });
    },
  );
});
