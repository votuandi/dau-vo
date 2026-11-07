import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupervisorScoreboard } from './supervisor-scoreboard';
import { supervisorScoreboardApi } from '@/services/api/scoreboard';
import { ApiClientError } from '@/services/api/client';

const source = {
  kind: 'supervisor' as const,
  tournamentCode: 'GIAI',
  scoreboardCode: 'GS01',
  access: {
    token: 'read-only',
    tournamentName: 'Giải võ thuật',
    matchPublicId: null as string | null,
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Supervisor scoreboard', () => {
  it('shows tournament while waiting, follows matches and retains the match after exit', async () => {
    vi.useFakeTimers();
    const state = vi
      .spyOn(supervisorScoreboardApi, 'state')
      .mockResolvedValue({ tournamentName: 'Giải võ thuật', matchPublicId: null });
    render(
      <SupervisorScoreboard
        source={source}
        onSelect={vi.fn()}
        renderMatch={(id) => <p>Board {id}</p>}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('heading', { name: 'Giải võ thuật' })).toBeVisible();
    expect(screen.getByText('Trận đấu chưa bắt đầu')).toBeVisible();
    state.mockResolvedValue({ tournamentName: 'Giải võ thuật', matchPublicId: 'MATCH1' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('Board MATCH1')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('Board MATCH1')).toBeVisible();
    state.mockResolvedValue({ tournamentName: 'Giải võ thuật', matchPublicId: 'MATCH2' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText('Board MATCH2')).toBeVisible();
    expect(screen.queryByText('Board MATCH1')).not.toBeInTheDocument();
  });

  it('keeps the last board on network failure and asks for credentials when access is revoked', async () => {
    vi.useFakeTimers();
    const state = vi
      .spyOn(supervisorScoreboardApi, 'state')
      .mockRejectedValue(new Error('offline'));
    const renderMatch = vi.fn((id: string, reconnecting: boolean) => (
      <p data-reconnecting={reconnecting}>Board {id}</p>
    ));
    const { unmount } = render(
      <SupervisorScoreboard
        source={{ ...source, access: { ...source.access, matchPublicId: 'MATCH1' } }}
        onSelect={vi.fn()}
        renderMatch={renderMatch}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Board MATCH1')).toBeVisible();
    expect(renderMatch).toHaveBeenLastCalledWith('MATCH1', true);
    state.mockRejectedValue(new ApiClientError(401, {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Mã giám sát đã hết hiệu lực');
    const calls = state.mock.calls.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(state).toHaveBeenCalledTimes(calls);
  });
});
