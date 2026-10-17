import type { AdminDashboardTournament } from '@/services/api/admin-management';
import type { DashboardScoreStats } from '@martial-arts-scoring/shared-types';

export function mergeScoreStats(stats: readonly DashboardScoreStats[]): DashboardScoreStats {
  const samples = stats.filter((stat) => stat.count > 0);
  return {
    count: samples.reduce((sum, stat) => sum + stat.count, 0),
    sum: samples.reduce((sum, stat) => sum + stat.sum, 0),
    min: samples.length ? Math.min(...samples.map((stat) => stat.min ?? 0)) : null,
    max: samples.length ? Math.max(...samples.map((stat) => stat.max ?? 0)) : null,
  };
}

export const dashboardRoundLabels = {
  ROUND_1: 'Hiệp 1',
  ROUND_2: 'Hiệp 2',
  OVERTIME: 'Hiệp phụ',
} as const;

export function summarizePerformance(tournaments: readonly AdminDashboardTournament[]) {
  const matches = tournaments.flatMap((tournament) => tournament.performance ?? []);
  const timedMatches = matches.filter((match) => match.elapsedMs > 0);
  return {
    matches,
    scores: mergeScoreStats(matches.map((match) => match.score)),
    rounds: (Object.keys(dashboardRoundLabels) as (keyof typeof dashboardRoundLabels)[]).map(
      (key) => ({
        key,
        label: dashboardRoundLabels[key],
        stats: mergeScoreStats(matches.map((match) => match.rounds[key])),
      }),
    ),
    overtimeMatches: matches.filter((match) => match.needsOvertime).length,
    elapsedMs: matches.reduce((sum, match) => sum + match.elapsedMs, 0),
    timedMatches: timedMatches.length,
    publishedMatches: matches.filter((match) => match.score.count === 2).length,
  };
}

export const matchSegments = [
  { key: 'COMPLETED', label: 'Hoàn thành', color: '#6366f1', className: 'bg-indigo-500' },
  { key: 'IN_PROGRESS', label: 'Đang diễn ra', color: '#10b981', className: 'bg-emerald-500' },
  { key: 'NOT_STARTED', label: 'Chờ thi đấu', color: '#38bdf8', className: 'bg-sky-400' },
  { key: 'SUSPENDED', label: 'Tạm dừng', color: '#f59e0b', className: 'bg-amber-500' },
] as const;

export function summarizeDashboard(tournaments: readonly AdminDashboardTournament[]) {
  const summary = {
    tournaments: tournaments.length,
    active: 0,
    athletes: 0,
    organizations: 0,
    weightClasses: 0,
    judges: 0,
    supervisors: 0,
    totalMatches: 0,
    matches: { NOT_STARTED: 0, IN_PROGRESS: 0, SUSPENDED: 0, COMPLETED: 0 },
  };
  for (const tournament of tournaments) {
    if (tournament.status === 'ACTIVE') summary.active += 1;
    summary.athletes += tournament.athleteCount;
    summary.organizations += tournament.organizationCount;
    summary.weightClasses += tournament.weightClassCount;
    summary.judges += tournament.officials.JUDGE;
    summary.supervisors += tournament.officials.SUPERVISOR;
    for (const { key } of matchSegments) {
      summary.matches[key] += tournament.matches[key];
      summary.totalMatches += tournament.matches[key];
    }
  }
  return summary;
}

export function totalMatches(tournament: AdminDashboardTournament) {
  return matchSegments.reduce((total, { key }) => total + tournament.matches[key], 0);
}

export function completionPercent(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}
