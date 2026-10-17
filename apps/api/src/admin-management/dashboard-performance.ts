import type {
  DashboardMatchPerformance,
  DashboardScoreStats,
} from '@martial-arts-scoring/shared-types';

interface PerformanceRound {
  readonly stage: string;
  readonly roundNumber: number;
  readonly durationMs: number | null;
  readonly endsAt: Date;
  readonly endedAt: Date | null;
  readonly pausedAt: Date | null;
  readonly remainingDurationMs: number | null;
  readonly invalidatedAt: Date | null;
  readonly athleteResults: readonly {
    judgePoints: number;
    invalidatedAt: Date | null;
  }[];
}

interface PerformanceMatch {
  readonly id: string;
  readonly publicId: string;
  readonly tournamentId: string;
  readonly lifecycle: string;
  readonly status: string;
  readonly roundDurationMs: number;
  readonly athletes: readonly { color: string; name: string }[];
  readonly rounds: readonly PerformanceRound[];
  readonly outcome: {
    readonly method: string;
    readonly sourceAppeal: {
      readonly invalidatedAt: Date | null;
      readonly status: string;
      readonly sourceRound: { readonly invalidatedAt: Date | null };
      readonly adjustments: readonly { finalScore: number }[];
    } | null;
  } | null;
}

export function scoreStats(values: readonly number[]): DashboardScoreStats {
  return {
    count: values.length,
    sum: values.reduce((sum, value) => sum + value, 0),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

/** Use the round clock, not wall time: endsAt moves forward after every pause. */
export function roundElapsedMs(
  round: PerformanceRound,
  fallbackDuration: number,
  now: Date,
): number {
  const duration = Math.max(0, round.durationMs ?? fallbackDuration);
  if (round.invalidatedAt !== null) return 0;
  if (round.endedAt !== null) return duration;
  const remaining =
    round.pausedAt !== null
      ? (round.remainingDurationMs ?? duration)
      : round.endsAt.getTime() - now.getTime();
  return Math.min(duration, Math.max(0, duration - remaining));
}

export function matchPerformance(
  match: PerformanceMatch,
  now: Date,
): DashboardMatchPerformance {
  const rounds = match.rounds.filter((round) => round.invalidatedAt === null);
  const roundScores = (stage: string, roundNumber?: number) =>
    scoreStats(
      rounds
        .filter(
          (round) =>
            round.stage === stage &&
            (roundNumber === undefined || round.roundNumber === roundNumber) &&
            round.endedAt !== null,
        )
        .flatMap((round) => {
          const results = round.athleteResults.filter(
            (result) => result.invalidatedAt === null,
          );
          return results.length === 2
            ? results.map((result) => result.judgePoints)
            : [];
        }),
    );
  const appeal = match.outcome?.sourceAppeal;
  const scores =
    match.lifecycle === 'COMPLETED' &&
    appeal?.status === 'COMPLETED' &&
    appeal.invalidatedAt === null &&
    appeal.sourceRound.invalidatedAt === null &&
    appeal.adjustments.length === 2
      ? appeal.adjustments.map((adjustment) => adjustment.finalScore)
      : [];
  return {
    id: match.id,
    publicId: match.publicId,
    tournamentId: match.tournamentId,
    redName:
      match.athletes.find((athlete) => athlete.color === 'RED')?.name ?? null,
    blueName:
      match.athletes.find((athlete) => athlete.color === 'BLUE')?.name ?? null,
    completed: match.lifecycle === 'COMPLETED',
    needsOvertime:
      rounds.some((round) => round.stage === 'OVERTIME') ||
      match.status.startsWith('OVERTIME_') ||
      match.outcome?.method === 'OVERTIME_SCORE' ||
      match.outcome?.method === 'MANUAL_AFTER_OVERTIME_TIE',
    elapsedMs: rounds.reduce(
      (sum, round) => sum + roundElapsedMs(round, match.roundDurationMs, now),
      0,
    ),
    rounds: {
      ROUND_1: roundScores('REGULATION', 1),
      ROUND_2: roundScores('REGULATION', 2),
      OVERTIME: roundScores('OVERTIME'),
    },
    score: scoreStats(scores),
  };
}
