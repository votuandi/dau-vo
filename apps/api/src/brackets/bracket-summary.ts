/** The bounded operational capacity for a single-elimination draw. */
export const MAX_BRACKET_ATHLETES = 64;

export interface BracketSummary {
  athleteCount: number;
  bracketSize: number;
  roundCount: number;
  totalFixtureCount: number;
  firstRoundFixtureCount: number;
  byeCount: number;
}

/**
 * Calculates the draw shape only.  It intentionally has no random or storage
 * dependency so setup, preview and graph tests cannot drift apart.
 */
export function summarizeBracket(athleteCount: number): BracketSummary {
  if (!Number.isSafeInteger(athleteCount) || athleteCount < 2)
    throw new Error('At least two athletes are required to size a bracket.');
  if (athleteCount > MAX_BRACKET_ATHLETES)
    throw new Error(
      `Bracket cannot contain more than ${MAX_BRACKET_ATHLETES} athletes.`,
    );
  const bracketSize = nextPowerOfTwo(athleteCount);
  return {
    athleteCount,
    bracketSize,
    roundCount: Math.log2(bracketSize),
    totalFixtureCount: athleteCount - 1,
    firstRoundFixtureCount: athleteCount - bracketSize / 2,
    byeCount: bracketSize - athleteCount,
  };
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}
