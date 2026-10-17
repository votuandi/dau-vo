import {
  matchPerformance,
  roundElapsedMs,
  scoreStats,
} from './dashboard-performance';

type MatchInput = Parameters<typeof matchPerformance>[0];
type RoundInput = MatchInput['rounds'][number];
const now = new Date('2026-10-17T10:00:00Z');
const round: RoundInput = {
  stage: 'REGULATION',
  roundNumber: 1,
  durationMs: 120_000,
  endsAt: new Date(now.getTime() + 30_000),
  endedAt: null,
  pausedAt: null,
  remainingDurationMs: null,
  invalidatedAt: null,
  athleteResults: [
    { judgePoints: 0, invalidatedAt: null },
    { judgePoints: 6, invalidatedAt: null },
  ],
};
const match: MatchInput = {
  id: 'match',
  publicId: 'ABC',
  tournamentId: 'one',
  lifecycle: 'COMPLETED',
  status: 'FINISHED',
  roundDurationMs: 120_000,
  athletes: [
    { color: 'RED', name: 'Đỏ' },
    { color: 'BLUE', name: 'Xanh' },
  ],
  rounds: [{ ...round, endedAt: now }],
  outcome: {
    method: 'REGULATION_SCORE',
    sourceAppeal: {
      status: 'COMPLETED',
      invalidatedAt: null,
      sourceRound: { invalidatedAt: null },
      adjustments: [{ finalScore: 0 }, { finalScore: 8 }],
    },
  },
};

describe('dashboard score and clock statistics', () => {
  it('keeps zero scores and distinguishes absent data from zero', () => {
    expect(scoreStats([0, 6])).toEqual({ count: 2, sum: 6, min: 0, max: 6 });
    expect(scoreStats([])).toEqual({ count: 0, sum: 0, min: null, max: null });
  });

  it('uses the remaining clock for pauses and resumed rounds instead of wall duration', () => {
    expect(roundElapsedMs(round, 120_000, now)).toBe(90_000);
    expect(
      roundElapsedMs(
        { ...round, pausedAt: now, remainingDurationMs: 45_000 },
        120_000,
        new Date(now.getTime() + 600_000),
      ),
    ).toBe(75_000);
    expect(roundElapsedMs({ ...round, endedAt: now }, 120_000, now)).toBe(
      120_000,
    );
    expect(roundElapsedMs({ ...round, invalidatedAt: now }, 120_000, now)).toBe(
      0,
    );
    expect(
      roundElapsedMs(
        { ...round, endsAt: new Date(now.getTime() - 600_000) },
        120_000,
        now,
      ),
    ).toBe(120_000);
    expect(roundElapsedMs({ ...round, durationMs: null }, 120_000, now)).toBe(
      90_000,
    );
  });

  it('uses captured round points and published adjusted match scores independently', () => {
    const result = matchPerformance(match, now);
    expect(result.rounds.ROUND_1).toEqual({ count: 2, sum: 6, min: 0, max: 6 });
    expect(result.score).toEqual({ count: 2, sum: 8, min: 0, max: 8 });
    expect(result.elapsedMs).toBe(120_000);
    expect(result.needsOvertime).toBe(false);
  });

  it('never combines regulation points with the decisive overtime score', () => {
    const result = matchPerformance(
      {
        ...match,
        rounds: [
          ...match.rounds,
          {
            ...round,
            stage: 'OVERTIME',
            endedAt: now,
            athleteResults: [
              { judgePoints: 2, invalidatedAt: null },
              { judgePoints: 1, invalidatedAt: null },
            ],
          },
          {
            ...round,
            invalidatedAt: now,
            endedAt: now,
            athleteResults: [
              { judgePoints: 500, invalidatedAt: null },
              { judgePoints: 600, invalidatedAt: null },
            ],
          },
        ],
        outcome: {
          method: 'OVERTIME_SCORE',
          sourceAppeal: {
            ...match.outcome!.sourceAppeal!,
            adjustments: [{ finalScore: 3 }, { finalScore: 1 }],
          },
        },
      },
      now,
    );
    expect(result.needsOvertime).toBe(true);
    expect(result.score).toEqual({ count: 2, sum: 4, min: 1, max: 3 });
    expect(result.elapsedMs).toBe(240_000);
    expect(result.rounds.ROUND_1.max).toBe(6);
    expect(result.rounds.OVERTIME).toEqual({
      count: 2,
      sum: 3,
      min: 1,
      max: 2,
    });
  });

  it('does not fabricate scores for unfinished, invalidated or incomplete results', () => {
    expect(
      matchPerformance({ ...match, lifecycle: 'IN_PROGRESS' }, now).score.count,
    ).toBe(0);
    expect(
      matchPerformance({ ...match, outcome: null }, now).score.min,
    ).toBeNull();
    expect(
      matchPerformance(
        {
          ...match,
          outcome: {
            ...match.outcome!,
            sourceAppeal: {
              ...match.outcome!.sourceAppeal!,
              invalidatedAt: now,
            },
          },
        },
        now,
      ).score.count,
    ).toBe(0);
    const incompleteRound = {
      ...round,
      endedAt: now,
      athleteResults: [
        { judgePoints: 6, invalidatedAt: null },
        { judgePoints: 4, invalidatedAt: now },
      ],
    };
    expect(
      matchPerformance({ ...match, rounds: [incompleteRound] }, now).rounds
        .ROUND_1.count,
    ).toBe(0);
  });

  it('counts a match awaiting its first overtime round as needing overtime', () => {
    expect(
      matchPerformance(
        {
          ...match,
          lifecycle: 'IN_PROGRESS',
          status: 'OVERTIME_READY',
          outcome: null,
        },
        now,
      ).needsOvertime,
    ).toBe(true);
  });
});
