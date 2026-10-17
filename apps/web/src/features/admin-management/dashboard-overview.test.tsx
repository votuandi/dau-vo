import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDashboardTournament } from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import { DashboardOverview } from './dashboard-overview';

const api = vi.hoisted(() => ({ getDashboard: vi.fn() }));
vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));

const tournament: AdminDashboardTournament = {
  id: 'one',
  name: 'Giải Võ cổ truyền',
  status: TournamentStatus.ACTIVE,
  startDate: null,
  endDate: null,
  location: null,
  sport: { name: 'Võ cổ truyền' },
  athleteCount: 20,
  organizationCount: 3,
  weightClassCount: 4,
  matches: { NOT_STARTED: 4, IN_PROGRESS: 2, SUSPENDED: 1, COMPLETED: 3 },
  officials: { JUDGE: 6, SUPERVISOR: 2 },
  performance: [],
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardOverview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe('admin dashboard', () => {
  beforeEach(() => {
    api.getDashboard.mockResolvedValue({ tournaments: [tournament] });
  });

  it('shows real lifecycle counts and completion, including suspended matches', async () => {
    renderDashboard();
    expect(await screen.findByRole('img', { name: 'Tổng 10 trận, 30% hoàn thành' })).toBeVisible();
    expect(screen.getByText('6 giám định · 2 giám sát')).toBeVisible();
    expect(screen.getByText('2 trận đang diễn ra')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ Giải Võ cổ truyền' })).toHaveAttribute(
      'aria-valuenow',
      '30',
    );
    expect(
      within(
        screen.getByRole('table', { name: 'Thống kê trận đấu và vận động viên theo giải đấu' }),
      ).getByRole('link', { name: 'Giải Võ cổ truyền' }),
    ).toHaveAttribute('href', '/admin/tournaments/one');
  });

  it('recalculates all charts and the table when filtering by tournament', async () => {
    api.getDashboard.mockResolvedValue({
      tournaments: [
        tournament,
        {
          ...tournament,
          id: 'two',
          name: 'Giải Karate',
          status: 'FINISHED',
          matches: { NOT_STARTED: 0, IN_PROGRESS: 0, SUSPENDED: 0, COMPLETED: 5 },
        },
      ],
    });
    renderDashboard();
    expect(await screen.findByRole('img', { name: 'Tổng 15 trận, 53% hoàn thành' })).toBeVisible();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } });
    expect(screen.getByRole('img', { name: 'Tổng 5 trận, 100% hoàn thành' })).toBeVisible();
    expect(
      within(
        screen.getByRole('table', { name: 'Thống kê trận đấu và vận động viên theo giải đấu' }),
      ).queryByText('Giải Võ cổ truyền'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Đi đến giải đấu/ })).toHaveAttribute(
      'href',
      '/admin/tournaments/two/matches',
    );
  });

  it('handles tournaments without matches without NaN percentages', async () => {
    api.getDashboard.mockResolvedValue({
      tournaments: [
        { ...tournament, matches: { NOT_STARTED: 0, IN_PROGRESS: 0, SUSPENDED: 0, COMPLETED: 0 } },
      ],
    });
    renderDashboard();
    expect(await screen.findByRole('img', { name: 'Tổng 0 trận, 0% hoàn thành' })).toBeVisible();
    expect(screen.getByText('Chưa có trận đấu trong phạm vi đã chọn.')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('provides an empty state and recovery from failed requests', async () => {
    api.getDashboard
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ tournaments: [] });
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa thể tải thống kê');
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới thống kê' }));
    expect(await screen.findByText('Sẵn sàng cho giải đấu đầu tiên')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('paginates the tournament table', async () => {
    api.getDashboard.mockResolvedValue({
      tournaments: Array.from({ length: 7 }, (_, index) => ({
        ...tournament,
        id: String(index),
        name: `Giải ${String(index + 1)}`,
      })),
    });
    renderDashboard();
    await screen.findByRole('table', { name: 'Thống kê trận đấu và vận động viên theo giải đấu' });
    expect(
      within(
        screen.getByRole('table', { name: 'Thống kê trận đấu và vận động viên theo giải đấu' }),
      ).queryByText('Giải 7'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(
      within(
        screen.getByRole('table', { name: 'Thống kê trận đấu và vận động viên theo giải đấu' }),
      ).getByText('Giải 7'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });
});
