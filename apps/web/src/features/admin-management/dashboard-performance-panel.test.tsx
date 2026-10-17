import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type {
  DashboardMatchPerformance,
  DashboardScoreStats,
} from '@martial-arts-scoring/shared-types';
import type { AdminDashboardTournament } from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import { DashboardPerformancePanel } from './dashboard-performance-panel';
import { mergeScoreStats, summarizePerformance } from './dashboard-model';

const empty: DashboardScoreStats = { count: 0, sum: 0, min: null, max: null };
const match: DashboardMatchPerformance = {
  id: 'match',
  publicId: 'ABC',
  tournamentId: 'one',
  redName: 'Nguyễn An',
  blueName: 'Trần Bình',
  completed: true,
  needsOvertime: true,
  elapsedMs: 360_000,
  rounds: {
    ROUND_1: { count: 2, sum: 6, min: 0, max: 6 },
    ROUND_2: { count: 2, sum: 10, min: 4, max: 6 },
    OVERTIME: { count: 2, sum: 3, min: 1, max: 2 },
  },
  score: { count: 2, sum: 7, min: 2, max: 5 },
};
const tournament: AdminDashboardTournament = {
  id: 'one',
  name: 'Giải một',
  status: TournamentStatus.ACTIVE,
  startDate: null,
  endDate: null,
  location: null,
  sport: { name: 'Võ' },
  athleteCount: 2,
  organizationCount: 1,
  weightClassCount: 1,
  matches: { NOT_STARTED: 0, IN_PROGRESS: 0, SUSPENDED: 0, COMPLETED: 1 },
  officials: { JUDGE: 3, SUPERVISOR: 1 },
  performance: [match],
};

describe('dashboard performance panel', () => {
  it('weights averages by sample count and preserves zero minima', () => {
    expect(
      mergeScoreStats([
        { count: 2, sum: 6, min: 0, max: 6 },
        { count: 4, sum: 40, min: 8, max: 12 },
        empty,
      ]),
    ).toEqual({ count: 6, sum: 46, min: 0, max: 12 });
    expect(mergeScoreStats([])).toEqual(empty);
  });

  it('shows each match, per-round ranges, published averages and clock minutes', () => {
    render(
      <MemoryRouter>
        <DashboardPerformancePanel tournaments={[tournament]} />
      </MemoryRouter>,
    );
    const roundTable = screen.getByRole('table', {
      name: 'Điểm trung bình, thấp nhất và cao nhất theo hiệp',
    });
    const roundOne = within(roundTable).getByRole('row', { name: 'Hiệp 1 3 0 6 2' });
    expect(roundOne).toBeVisible();
    const matchTable = screen.getByRole('table', {
      name: 'Điểm số trung bình, tối thiểu, tối đa từng hiệp và kết quả từng trận',
    });
    expect(within(matchTable).getByRole('link', { name: '#ABC' })).toHaveAttribute(
      'href',
      '/admin/matches/match',
    );
    expect(within(matchTable).getByText('0–6')).toBeVisible();
    expect(within(matchTable).getByText('3,5')).toBeVisible();
    expect(within(matchTable).getByText('2–5')).toBeVisible();
    expect(within(matchTable).getByText('6')).toBeVisible();
  });

  it('limits all performance totals to the supplied tournament scope', () => {
    const other = {
      ...tournament,
      id: 'two',
      performance: [
        { ...match, id: 'other', elapsedMs: 120_000, needsOvertime: false, score: empty },
      ],
    };
    expect(summarizePerformance([tournament, other])).toMatchObject({
      elapsedMs: 480_000,
      overtimeMatches: 1,
      publishedMatches: 1,
    });
    expect(summarizePerformance([other])).toMatchObject({
      elapsedMs: 120_000,
      overtimeMatches: 0,
      publishedMatches: 0,
      scores: empty,
    });
  });

  it('shows missing published data distinctly from a zero score', () => {
    render(
      <MemoryRouter>
        <DashboardPerformancePanel
          tournaments={[
            {
              ...tournament,
              performance: [
                {
                  ...match,
                  completed: false,
                  score: empty,
                  rounds: { ROUND_1: empty, ROUND_2: empty, OVERTIME: empty },
                },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Chưa công bố')).toBeVisible();
    expect(screen.getByText('0 trận có điểm công bố')).toBeVisible();
  });
});
