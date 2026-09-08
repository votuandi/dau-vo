import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AthleteColor, MatchStatus } from '@martial-arts-scoring/shared-types';
import { InspectorConsole } from './inspector-console';
import { createMatchSnapshot, createRealtimeState, inspectorSession } from '@/test/factories';

function snapshotFor(status: MatchStatus) {
  const running = status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const roundNumber = status === MatchStatus.ROUND_2_RUNNING ? 2 : 1;
  const base = createMatchSnapshot();
  const activeRound = base.activeRound;

  if (activeRound === null) {
    throw new Error('The match snapshot fixture requires an active round.');
  }

  return createMatchSnapshot({
    activeRound: running
      ? {
          ...activeRound,
          roundNumber,
        }
      : null,
    athletes: base.athletes.map((athlete) =>
      athlete.color === AthleteColor.RED
        ? { ...athlete, score: 5, violations: 1 }
        : { ...athlete, score: 3, violations: 2 },
    ),
    match: {
      ...base.match,
      currentRound: status === MatchStatus.WAITING ? null : roundNumber,
      finishedAt: status === MatchStatus.FINISHED ? '2026-09-01T12:04:00.000Z' : null,
      startedAt: status === MatchStatus.WAITING ? null : base.match.startedAt,
      status,
    },
  });
}

describe('InspectorConsole', () => {
  it('renders the authoritative WAITING → Round 1 → BREAK → Round 2 → FINISHED workflow', async () => {
    const user = userEvent.setup();
    const startRound = vi.fn(() => Promise.resolve());
    const submitPenalty = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.WAITING),
          startRound,
          submitPenalty,
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByText('CHỜ BẮT ĐẦU')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 1' }));
    expect(startRound).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toBeDisabled();

    rerender(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
          startRound,
          submitPenalty,
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByText('HIỆP 1')).toBeVisible();
    expect(screen.getByText('Nguyễn Văn Đỏ')).toBeVisible();
    expect(screen.getAllByText('Lỗi vi phạm:')).toHaveLength(2);
    expect(screen.getAllByText('5')).toHaveLength(1);
    expect(screen.getAllByText('3')).toHaveLength(1);
    const redPenalty = screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' });
    await user.click(redPenalty);
    expect(submitPenalty).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toHaveTextContent('XÁC NHẬN LỖI ĐỎ');
    await user.click(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' }));
    expect(submitPenalty).toHaveBeenCalledExactlyOnceWith(AthleteColor.RED);

    rerender(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.BREAK),
          startRound,
          submitPenalty,
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByText('GIẢI LAO')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 2' }));
    expect(startRound).toHaveBeenCalledTimes(2);

    rerender(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_2_RUNNING),
          startRound,
          submitPenalty,
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByText('HIỆP 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi lỗi XANH' })).toBeEnabled();

    rerender(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.FINISHED),
          startRound,
          submitPenalty,
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByText('TRẬN ĐẤU ĐÃ KẾT THÚC')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ghi lỗi XANH' })).toBeDisabled();
  });

  it('disables controls when the session is revoked or realtime connection is lost', () => {
    render(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          connectionStatus: 'revoked',
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByText('Mất kết nối')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ghi lỗi XANH' })).toBeDisabled();
  });
});
