export type DashboardRoundKey = 'ROUND_1' | 'ROUND_2' | 'OVERTIME';

/** Sufficient statistics allow averages to be weighted across tournaments. */
export interface DashboardScoreStats {
  readonly count: number;
  readonly sum: number;
  readonly min: number | null;
  readonly max: number | null;
}

export interface DashboardMatchPerformance {
  readonly id: string;
  readonly publicId: string;
  readonly tournamentId: string;
  readonly redName: string | null;
  readonly blueName: string | null;
  readonly completed: boolean;
  readonly needsOvertime: boolean;
  readonly elapsedMs: number;
  readonly rounds: Readonly<Record<DashboardRoundKey, DashboardScoreStats>>;
  /** Published scores of the decisive period; never add regulation to overtime. */
  readonly score: DashboardScoreStats;
}
