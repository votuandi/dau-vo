import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AthleteColor } from '@/types/shared';
import type { AdminMatchMonitoring as AdminMatchMonitoringResponse } from '@/services/api/admin-management';
import { createMatchSnapshot } from '@/test/factories';
import { AdminMatchMonitoring } from './admin-match-monitoring';

const adminManagementApiMock = vi.hoisted(() => ({ getMatchMonitoring: vi.fn() }));

vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: adminManagementApiMock }));

const occurredAt = '2026-09-10T10:05:08.000Z';

function monitoringFixture(
  overrides: Partial<AdminMatchMonitoringResponse> = {},
): AdminMatchMonitoringResponse {
  return {
    auditLogs: [],
    penalties: [],
    scoreEvents: [
      {
        athlete: { color: AthleteColor.RED, name: 'Vận động viên Đỏ' },
        createdAt: '2026-09-10T10:05:09.000Z',
        id: 'event-red',
        occurredAt,
        penaltyId: null,
        revertedAt: null,
        revertedByAuditId: null,
        roundElapsedMs: 5_000,
        roundNumber: 1,
        scoringWindowId: 'window-red',
        type: 'REFEREE_POINT',
        value: 1,
      },
      {
        athlete: { color: AthleteColor.BLUE, name: 'Vận động viên Xanh' },
        createdAt: '2026-09-10T10:06:09.000Z',
        id: 'event-blue',
        occurredAt,
        penaltyId: null,
        revertedAt: '2026-09-10T10:07:09.000Z',
        revertedByAuditId: 'audit-1',
        roundElapsedMs: 61_000,
        roundNumber: 2,
        scoringWindowId: null,
        type: 'PENALTY',
        value: -1,
      },
    ],
    scoringWindows: [
      {
        endsAt: '2026-09-10T10:05:09.000Z',
        id: 'window-red',
        invalidatedAt: null,
        invalidatedByAuditId: null,
        occurredAt,
        refereeVotes: [
          {
            athleteColor: AthleteColor.RED,
            invalidatedAt: null,
            refereeSlot: 'REFEREE_1',
            serverReceivedAt: occurredAt,
          },
        ],
        resolvedAt: '2026-09-10T10:05:09.000Z',
        roundElapsedMs: 5_000,
        roundNumber: 1,
        scoreAwarded: true,
        startedAt: occurredAt,
        winningColor: AthleteColor.RED,
      },
      {
        endsAt: '2026-09-10T10:06:09.000Z',
        id: 'window-blue',
        invalidatedAt: '2026-09-10T10:07:09.000Z',
        invalidatedByAuditId: 'audit-2',
        occurredAt,
        refereeVotes: [],
        resolvedAt: '2026-09-10T10:06:09.000Z',
        roundElapsedMs: 61_000,
        roundNumber: 2,
        scoreAwarded: true,
        startedAt: occurredAt,
        winningColor: AthleteColor.BLUE,
      },
      {
        endsAt: '2026-09-10T10:07:09.000Z',
        id: 'window-neutral',
        invalidatedAt: null,
        invalidatedByAuditId: null,
        occurredAt,
        refereeVotes: [],
        resolvedAt: '2026-09-10T10:07:09.000Z',
        roundElapsedMs: null,
        roundNumber: 1,
        scoreAwarded: false,
        startedAt: occurredAt,
        winningColor: AthleteColor.RED,
      },
    ],
    snapshot: createMatchSnapshot(),
    ...overrides,
  };
}

function renderMonitoring(response = monitoringFixture()): void {
  adminManagementApiMock.getMatchMonitoring.mockResolvedValue(response);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AdminMatchMonitoring matchId="a92bbb35-3fa2-4e52-9749-ad16b4e659cc" />
    </QueryClientProvider>,
  );
}

describe('AdminMatchMonitoring', () => {
  beforeEach(() => {
    adminManagementApiMock.getMatchMonitoring.mockReset();
  });
  afterEach(cleanup);

  it('renders the loading state before the monitoring snapshot arrives', () => {
    adminManagementApiMock.getMatchMonitoring.mockReturnValue(new Promise(() => undefined));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminMatchMonitoring matchId="a92bbb35-3fa2-4e52-9749-ad16b4e659cc" />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Đang tải trạng thái trận đấu…')).toBeVisible();
  });

  it('styles awarded and no-score scoring windows by their valid outcome', async () => {
    renderMonitoring();
    await screen.findByText('Hiệp 1 · ĐỎ +1');
    expect(screen.getByTestId('scoring-window-window-red')).toHaveClass(
      'border-red-200',
      'bg-red-50',
      'text-red-800',
    );
    expect(screen.getByTestId('scoring-window-window-blue')).toHaveClass(
      'border-blue-200',
      'bg-blue-50',
      'text-blue-800',
    );
    expect(screen.getByTestId('scoring-window-window-neutral')).toHaveClass(
      'border-slate-200',
      'bg-slate-100',
      'text-slate-800',
    );
  });

  it('styles score events by athlete and retains reverted status', async () => {
    renderMonitoring();
    await screen.findByText('Điểm trọng tài', { exact: false });
    expect(screen.getByTestId('score-event-event-blue')).toHaveTextContent('Phạt');
    expect(screen.getByTestId('score-event-event-red')).toHaveClass(
      'border-red-200',
      'bg-red-50',
      'text-red-800',
      'overflow-x-auto',
      'whitespace-nowrap',
    );
    expect(screen.getByTestId('score-event-event-blue')).toHaveClass(
      'border-blue-200',
      'bg-blue-50',
      'text-blue-800',
    );
    expect(screen.getByText('Đã hoàn tác')).toBeInTheDocument();
  });

  it('shows second-precision timestamps and formatted round elapsed time', async () => {
    renderMonitoring();
    expect((await screen.findAllByText('Giây 00:05 trong hiệp 1')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Giây 01:01 trong hiệp 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d{2}:\d{2}:\d{2}/u).length).toBeGreaterThan(0);
  });

  it('shows a fallback when timing is unavailable and keeps invalidated windows', async () => {
    renderMonitoring();
    expect(await screen.findByText('Không xác định thời gian trong hiệp')).toBeVisible();
    expect(screen.getByText(/Đã hủy kết quả/u)).toBeVisible();
  });

  it('keeps empty history states', async () => {
    renderMonitoring(monitoringFixture({ scoreEvents: [], scoringWindows: [] }));
    expect(await screen.findByText('Chưa có cửa sổ chấm điểm.')).toBeVisible();
    expect(screen.getByText('Chưa có score event.')).toBeInTheDocument();
  });
});
