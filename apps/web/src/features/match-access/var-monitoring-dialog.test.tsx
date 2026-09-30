import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AthleteColor } from '@/types/shared';
import type { VarMonitoring } from '@/services/api/official-access';

const api = vi.hoisted(() => ({ varMonitoring: vi.fn() }));
vi.mock('@/services/api/official-access', () => ({ officialAccessApi: api }));

import { VarMonitoringDialog } from './var-monitoring-dialog';
import { officialMatchQueryKeys } from './queries';

const empty: VarMonitoring = { auditLogs: [], penalties: [], scoreEvents: [], scoringWindows: [] };

const historyFixture: VarMonitoring = {
  scoringWindows: [
    {
      id: 'window-1',
      roundNumber: 1,
      startedAt: '2026-09-30T10:00:00.000Z',
      occurredAt: '2026-09-30T10:00:00.000Z',
      roundElapsedMs: 65_000,
      endsAt: '2026-09-30T10:00:03.000Z',
      resolvedAt: '2026-09-30T10:00:02.000Z',
      invalidatedAt: '2026-09-30T10:01:00.000Z',
      invalidatedByAuditId: 'audit-1',
      winningColor: AthleteColor.RED,
      scoreAwarded: true,
      judgeVotes: [
        {
          judgeSlot: null,
          judgePosition: 2,
          athleteColor: AthleteColor.RED,
          serverReceivedAt: '2026-09-30T10:00:01.000Z',
          invalidatedAt: '2026-09-30T10:01:00.000Z',
        },
      ],
    },
  ],
  penalties: [
    {
      id: 'penalty-1',
      roundNumber: 2,
      value: -1,
      createdAt: '2026-09-30T10:02:00.000Z',
      revertedAt: '2026-09-30T10:03:00.000Z',
      revertedByAuditId: 'audit-2',
      athlete: { color: AthleteColor.BLUE, name: 'Nguyễn Xanh' },
    },
  ],
  scoreEvents: [
    {
      id: 'score-positive',
      roundNumber: 1,
      occurredAt: '2026-09-30T10:00:00.000Z',
      roundElapsedMs: 65_000,
      type: 'REFEREE_POINT',
      value: 1,
      createdAt: '2026-09-30T10:00:00.000Z',
      revertedAt: null,
      revertedByAuditId: null,
      scoringWindowId: 'window-1',
      penaltyId: null,
      athlete: { color: AthleteColor.RED, name: 'Nguyễn Đỏ' },
    },
    {
      id: 'score-negative',
      roundNumber: null,
      occurredAt: '2026-09-30T10:02:00.000Z',
      roundElapsedMs: null,
      type: 'PENALTY',
      value: -1,
      createdAt: '2026-09-30T10:02:00.000Z',
      revertedAt: '2026-09-30T10:03:00.000Z',
      revertedByAuditId: 'audit-2',
      scoringWindowId: null,
      penaltyId: 'penalty-1',
      athlete: { color: AthleteColor.BLUE, name: 'Nguyễn Xanh' },
    },
  ],
  auditLogs: [
    {
      id: 'audit-1',
      eventType: 'ROUND_RESULT_CANCELLED',
      metadata: { reason: '<b>review</b>' },
      createdAt: '2026-09-30T10:01:00.000Z',
    },
  ],
};

function renderDialog(
  matchId = 'match-1',
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <VarMonitoringDialog matchId={matchId} onClose={vi.fn()} />
      </QueryClientProvider>,
    ),
  };
}

describe('VarMonitoringDialog', () => {
  beforeEach(() => {
    api.varMonitoring.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all four read-only history sections and their empty states', async () => {
    api.varMonitoring.mockResolvedValueOnce(empty);
    renderDialog();
    expect(screen.getByText('Đang tải dữ liệu VAR…')).toBeVisible();
    await screen.findByText('Lịch sử cửa sổ chấm điểm (0)');
    expect(screen.getByText('Lỗi phạt (0)')).toBeVisible();
    expect(screen.getByText('Score events (0)')).toBeVisible();
    expect(screen.getByText('Audit logs (0)')).toBeVisible();
    expect(screen.getAllByText(/Chưa có/u)).toHaveLength(4);
  });

  it('renders the complete VAR history, including invalidated and reverted records', async () => {
    api.varMonitoring.mockResolvedValueOnce(historyFixture);
    renderDialog();

    await screen.findByText('Giám định 2:');
    expect(screen.getByText('+1 VĐV đỏ')).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' && element.textContent?.includes('Đã hủy kết quả') === true,
      ),
    ).toBeVisible();
    expect(screen.getAllByText('Đã vô hiệu')).toHaveLength(1);
    expect(screen.getByText('Giây 01:05 trong hiệp 1')).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' && element.textContent?.includes('Hiệp 2 · XANH') === true,
      ),
    ).toBeVisible();
    expect(screen.getAllByText('Đã hoàn tác')).toHaveLength(2);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' &&
          element.textContent?.startsWith('Điểm giám định · Hiệp 1') === true,
      ),
    ).toHaveTextContent('+1');
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' && element.textContent?.startsWith('Phạt · Hiệp —') === true,
      ),
    ).toHaveTextContent('-1');
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent?.includes('Không xác định thời gian trong hiệp') === true,
      ),
    ).toBeVisible();
    expect(screen.getByText('Đã hủy kết quả hiệp')).toBeVisible();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'PRE' && element.textContent?.includes('review') === true,
      ),
    ).toBeVisible();
  });

  it('uses stable fallbacks for nullable or missing history fields', async () => {
    api.varMonitoring.mockResolvedValueOnce({
      scoringWindows: undefined,
      penalties: [
        {
          id: 'legacy-penalty',
          roundNumber: null,
          value: -1,
          createdAt: undefined,
          revertedAt: null,
          athlete: null,
        },
      ],
      scoreEvents: [
        {
          id: 'legacy-event',
          roundNumber: null,
          occurredAt: undefined,
          roundElapsedMs: null,
          type: 'UNKNOWN_EVENT',
          value: 0,
          revertedAt: null,
          athlete: null,
        },
      ],
      auditLogs: undefined,
    } as unknown as VarMonitoring);
    renderDialog();

    await screen.findByText(/UNKNOWN_EVENT/u);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' && element.textContent?.startsWith('UNKNOWN_EVENT') === true,
      ),
    ).toBeVisible();
    expect(screen.getByText('Lịch sử cửa sổ chấm điểm (0)')).toBeVisible();
    expect(screen.getByText('Audit logs (0)')).toBeVisible();
  });

  it('surfaces fetch failure and retries without any mutation control', async () => {
    const user = userEvent.setup();
    api.varMonitoring.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty);
    renderDialog();
    await screen.findByRole('alert');
    expect(screen.getByText('Không thể tải dữ liệu VAR.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => {
      expect(api.varMonitoring).toHaveBeenCalledTimes(2);
    });
    await screen.findByText('Audit logs (0)');
    expect(screen.queryByRole('button', { name: /lưu|xác nhận|phạt/i })).not.toBeInTheDocument();
  });

  it('refreshes the four history collections at the admin monitoring interval', async () => {
    vi.useFakeTimers();
    api.varMonitoring.mockResolvedValueOnce(empty).mockResolvedValueOnce({
      ...empty,
      scoreEvents: [{ id: 'new-event', type: 'REFEREE_POINT' }],
    });
    const { queryClient } = renderDialog();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Score events (0)')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(api.varMonitoring).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(officialMatchQueryKeys.varMonitoring('match-1'))).toEqual({
      ...empty,
      scoreEvents: [{ id: 'new-event', type: 'REFEREE_POINT' }],
    });
  });

  it('stops polling when the dialog unmounts', async () => {
    vi.useFakeTimers();
    api.varMonitoring.mockResolvedValue(empty);
    const view = renderDialog();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Audit logs (0)')).toBeVisible();
    view.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(api.varMonitoring).toHaveBeenCalledTimes(1);
  });

  it('does not show a prior match response after matchId changes', async () => {
    let resolveFirst: ((value: typeof empty) => void) | undefined;
    api.varMonitoring
      .mockImplementationOnce(
        () =>
          new Promise<typeof empty>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...empty,
        auditLogs: [{ id: 'match-two', eventType: 'MATCH_TWO' }],
      });
    const view = renderDialog();
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <VarMonitoringDialog matchId="match-2" onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('MATCH_TWO')).toBeVisible();
    await act(async () => {
      resolveFirst?.(empty);
      await Promise.resolve();
    });
    expect(screen.getByText('MATCH_TWO')).toBeVisible();
  });

  it('does not update a dialog after an in-flight request is unmounted', async () => {
    let resolveRequest: ((value: typeof empty) => void) | undefined;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    api.varMonitoring.mockImplementationOnce(
      () =>
        new Promise<typeof empty>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const view = renderDialog();
    view.unmount();

    await act(async () => {
      resolveRequest?.(empty);
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps the last successful snapshot when a refresh fails', async () => {
    vi.useFakeTimers();
    api.varMonitoring.mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error('offline'));
    const { queryClient } = renderDialog();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Audit logs (0)')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(queryClient.getQueryState(officialMatchQueryKeys.varMonitoring('match-1'))?.status).toBe(
      'error',
    );
    expect(screen.getByText('Audit logs (0)')).toBeVisible();
  });
});
