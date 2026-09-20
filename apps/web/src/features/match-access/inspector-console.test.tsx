import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AthleteColor,
  MatchAccessRole,
  MatchExitMode,
  MatchStatus,
} from '@martial-arts-scoring/shared-types';
import { InspectorConsole } from './inspector-console';
import { createMatchSnapshot, createRealtimeState, inspectorSession } from '@/test/factories';

function snapshotFor(status: MatchStatus) {
  const active =
    status === MatchStatus.ROUND_1_RUNNING ||
    status === MatchStatus.ROUND_1_PAUSED ||
    status === MatchStatus.ROUND_2_RUNNING ||
    status === MatchStatus.ROUND_2_PAUSED;
  const roundNumber =
    status === MatchStatus.ROUND_2_RUNNING || status === MatchStatus.ROUND_2_PAUSED ? 2 : 1;
  const base = createMatchSnapshot();
  const activeRound = base.activeRound;

  if (activeRound === null) {
    throw new Error('The match snapshot fixture requires an active round.');
  }

  return createMatchSnapshot({
    activeRound: active
      ? {
          ...activeRound,
          pausedAt:
            status === MatchStatus.ROUND_1_PAUSED || status === MatchStatus.ROUND_2_PAUSED
              ? '2026-09-01T12:01:00.000Z'
              : null,
          remainingDurationMs:
            status === MatchStatus.ROUND_1_PAUSED || status === MatchStatus.ROUND_2_PAUSED
              ? 60_000
              : null,
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
      phase: status,
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

  it('shows match-scoped readiness and disables round start until every required display is connected', () => {
    const presence = createMatchSnapshot().presence.map((entry) =>
      entry.accessRole === MatchAccessRole.REFEREE_2
        ? { ...entry, connected: false, connectedSocketCount: 0 }
        : entry,
    );

    render(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          presence,
          snapshot: createMatchSnapshot({
            ...snapshotFor(MatchStatus.WAITING),
            readiness: {
              canStartRound: false,
              kind: 'LEGACY_MATCH_ACCESS',
              missingRequirements: ['REFEREE_2'],
              requiredRefereeCount: 3,
              referees: { REFEREE_1: true, REFEREE_2: false, REFEREE_3: true },
              scoreboardConnectedCount: 1,
            },
          }),
        })}
        session={inspectorSession}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Sẵn sàng trận đấu' })).toBeVisible();
    expect(screen.getByText('Trọng tài 1 đã kết nối')).toBeVisible();
    expect(screen.getByText('Trọng tài 2 chưa kết nối')).toBeVisible();
    expect(screen.getByText('Bảng điểm đã kết nối (1)')).toBeVisible();
    expect(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 1' })).toBeDisabled();
    expect(
      screen.getByText(
        'Chưa thể bắt đầu hiệp đấu. Đã phân công 3/3 trọng tài, kết nối 2/3 trọng tài và 1 bảng điểm.',
      ),
    ).toBeVisible();
  });

  it('confirms pause and resume without changing display state before server success', async () => {
    const user = userEvent.setup();
    const pauseRound = vi.fn(() => Promise.resolve(true));
    const resumeRound = vi.fn(() => Promise.resolve(true));
    const { rerender } = render(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          pauseRound,
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
        })}
        session={inspectorSession}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'TẠM DỪNG' }));
    expect(pauseRound).not.toHaveBeenCalled();
    expect(screen.getByText('Bạn có chắc muốn tạm dừng hiệp đấu hiện tại?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(pauseRound).toHaveBeenCalledOnce();

    rerender(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          resumeRound,
          snapshot: snapshotFor(MatchStatus.ROUND_1_PAUSED),
        })}
        session={inspectorSession}
      />,
    );
    expect(screen.getByText('HIỆP 1 · TẠM DỪNG')).toBeVisible();
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'TIẾP TỤC' }));
    expect(resumeRound).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(resumeRound).toHaveBeenCalledOnce();
  });

  it('uses confirmation dialogs for round cancellation and destructive match exit', async () => {
    const user = userEvent.setup();
    const cancelRoundResult = vi.fn(() => Promise.resolve(true));
    const exitMatch = vi.fn(() => Promise.resolve(true));
    const { rerender } = render(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          cancelRoundResult,
          snapshot: snapshotFor(MatchStatus.BREAK),
        })}
        session={inspectorSession}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'HỦY KẾT QUẢ HIỆP 1 VÀ BẮT ĐẦU LẠI' }));
    expect(cancelRoundResult).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText(/Tất cả điểm trọng tài và lỗi trong Hiệp 1/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy kết quả hiệp' }));
    expect(cancelRoundResult).toHaveBeenCalledOnce();

    rerender(
      <InspectorConsole
        isLogoutPending={false}
        onLogout={vi.fn()}
        realtime={createRealtimeState({
          exitMatch,
          snapshot: createMatchSnapshot({
            ...snapshotFor(MatchStatus.FINISHED),
            exit: {
              canExit: true,
              allowedModes: [MatchExitMode.CANCEL_RESULTS],
              blockedReasons: [],
            },
          }),
        })}
        session={inspectorSession}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'THOÁT TRẬN' }));
    expect(screen.getByRole('dialog', { name: 'Chọn cách thoát trận' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Hủy kết quả/ }));
    expect(exitMatch).not.toHaveBeenCalled();
    expect(screen.getByText(/Kết quả hiện tại sẽ bị vô hiệu/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy kết quả' }));
    expect(exitMatch).toHaveBeenCalledOnce();
    expect(exitMatch).toHaveBeenCalledWith(MatchExitMode.CANCEL_RESULTS);
  });
});
