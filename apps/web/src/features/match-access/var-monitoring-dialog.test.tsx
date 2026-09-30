import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ varMonitoring: vi.fn() }));
vi.mock('@/services/api/official-access', () => ({ officialAccessApi: api }));

import { VarMonitoringDialog } from './var-monitoring-dialog';
import { officialMatchQueryKeys } from './queries';

const empty = { auditLogs: [], penalties: [], scoreEvents: [], scoringWindows: [] };

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
