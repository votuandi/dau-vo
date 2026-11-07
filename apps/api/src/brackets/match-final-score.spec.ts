import { matchFinalScore } from './match-final-score';

const appeal = (overrides: Record<string, unknown> = {}) => ({
  status: 'COMPLETED',
  invalidatedAt: null,
  sourceRound: { invalidatedAt: null },
  adjustments: [
    { finalScore: 5, athlete: { color: 'RED' as const } },
    { finalScore: 8, athlete: { color: 'BLUE' as const } },
  ],
  ...overrides,
});

describe('matchFinalScore', () => {
  it('returns the published per-corner final score of a completed match', () => {
    expect(
      matchFinalScore({
        lifecycle: 'COMPLETED',
        outcome: { sourceAppeal: appeal() },
      }),
    ).toEqual({ RED: 5, BLUE: 8 });
  });

  it('keeps a 0-0 tie decided manually after overtime', () => {
    expect(
      matchFinalScore({
        lifecycle: 'COMPLETED',
        outcome: {
          sourceAppeal: appeal({
            adjustments: [
              { finalScore: 0, athlete: { color: 'BLUE' } },
              { finalScore: 0, athlete: { color: 'RED' } },
            ],
          }),
        },
      }),
    ).toEqual({ RED: 0, BLUE: 0 });
  });

  it.each([
    [
      'match not completed',
      { lifecycle: 'IN_PROGRESS', outcome: { sourceAppeal: appeal() } },
    ],
    ['no outcome yet', { lifecycle: 'COMPLETED', outcome: null }],
    [
      'admin decision without appeal',
      { lifecycle: 'COMPLETED', outcome: { sourceAppeal: null } },
    ],
    [
      'invalidated appeal',
      {
        lifecycle: 'COMPLETED',
        outcome: { sourceAppeal: appeal({ invalidatedAt: new Date() }) },
      },
    ],
    [
      'invalidated source round',
      {
        lifecycle: 'COMPLETED',
        outcome: {
          sourceAppeal: appeal({ sourceRound: { invalidatedAt: new Date() } }),
        },
      },
    ],
    [
      'missing a corner',
      {
        lifecycle: 'COMPLETED',
        outcome: {
          sourceAppeal: appeal({
            adjustments: [{ finalScore: 3, athlete: { color: 'RED' } }],
          }),
        },
      },
    ],
  ])('returns null when %s', (_label, match) => {
    expect(
      matchFinalScore(match as Parameters<typeof matchFinalScore>[0]),
    ).toBeNull();
  });
});
