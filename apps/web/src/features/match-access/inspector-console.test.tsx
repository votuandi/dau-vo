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
import { createMatchSnapshot, createRealtimeState } from '@/test/factories';

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
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.WAITING),
          startRound,
          submitPenalty,
        })}
      />,
    );

    expect(screen.getByText('CHỜ BẮT ĐẦU')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 1' }));
    expect(startRound).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toBeDisabled();

    rerender(
      <InspectorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
          startRound,
          submitPenalty,
        })}
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
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.BREAK),
          startRound,
          submitPenalty,
        })}
      />,
    );

    expect(screen.getByText('NGHỈ GIỮA HIỆP')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 2' }));
    expect(startRound).toHaveBeenCalledTimes(2);

    rerender(
      <InspectorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_2_RUNNING),
          startRound,
          submitPenalty,
        })}
      />,
    );

    expect(screen.getByText('HIỆP 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi lỗi XANH' })).toBeEnabled();

    rerender(
      <InspectorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.FINISHED),
          startRound,
          submitPenalty,
        })}
      />,
    );

    expect(screen.getByText('KẾT QUẢ CUỐI CÙNG')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi lỗi ĐỎ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ghi lỗi XANH' })).toBeDisabled();
  });

  it('disables controls when the session is revoked or realtime connection is lost', () => {
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          connectionStatus: 'revoked',
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
        })}
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
        realtime={createRealtimeState({
          pauseRound,
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'TẠM DỪNG' }));
    expect(pauseRound).not.toHaveBeenCalled();
    expect(screen.getByText('Bạn có chắc muốn tạm dừng hiệp đấu hiện tại?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(pauseRound).toHaveBeenCalledOnce();

    rerender(
      <InspectorConsole
        realtime={createRealtimeState({
          resumeRound,
          snapshot: snapshotFor(MatchStatus.ROUND_1_PAUSED),
        })}
      />,
    );
    expect(screen.getByText('HIỆP 1 TẠM DỪNG')).toBeVisible();
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
        realtime={createRealtimeState({
          cancelRoundResult,
          snapshot: snapshotFor(MatchStatus.BREAK),
        })}
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

  it('prioritizes the in-flight exit message and disables exit choices', () => {
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          cancellingResults: true,
          snapshot: createMatchSnapshot({
            exit: {
              canExit: true,
              allowedModes: [MatchExitMode.CANCEL_RESULTS],
              blockedReasons: ['ROUND_1_NOT_ENDED'],
            },
          }),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeDisabled();
    expect(screen.getByText('Đang xử lý yêu cầu thoát trận…')).toBeVisible();
  });

  it('explains that a server connection is required before exiting', () => {
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          connectionStatus: 'disconnected',
          snapshot: createMatchSnapshot({
            exit: {
              canExit: true,
              allowedModes: [MatchExitMode.CANCEL_RESULTS],
              blockedReasons: [],
            },
          }),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeDisabled();
    expect(screen.getByText('Cần kết nối máy chủ để thoát trận.')).toBeVisible();
  });

  it('waits for an authoritative snapshot before offering exit choices', () => {
    render(<InspectorConsole realtime={createRealtimeState({ snapshot: null })} />);

    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeDisabled();
    expect(screen.getByText('Đang đồng bộ các lựa chọn thoát trận từ máy chủ.')).toBeVisible();
  });

  it('only reports that exit is unavailable when the authoritative capability forbids it', () => {
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          snapshot: createMatchSnapshot({
            exit: { canExit: false, allowedModes: [], blockedReasons: ['ALREADY_COMPLETED'] },
          }),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeDisabled();
    expect(
      screen.getByText('Chưa thể thoát trận theo trạng thái hiện tại do máy chủ xác định.'),
    ).toBeVisible();
  });

  it('allows cancel-results before round 1 despite informational limitations on other exit modes', () => {
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          snapshot: createMatchSnapshot({
            exit: {
              canExit: true,
              allowedModes: [MatchExitMode.CANCEL_RESULTS],
              blockedReasons: ['ROUND_1_NOT_ENDED'],
            },
          }),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeEnabled();
    expect(
      screen.queryByText('Chưa thể thoát trận theo trạng thái hiện tại do máy chủ xác định.'),
    ).not.toBeInTheDocument();
  });

  it('keeps a rejected exit confirmation open and surfaces the server message', async () => {
    const user = userEvent.setup();
    const exitMatch = vi.fn(() => Promise.resolve(false));
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          exitMatch,
          resultCancellationErrorMessage: 'Máy chủ từ chối thao tác này.',
          snapshot: createMatchSnapshot({
            exit: {
              canExit: true,
              allowedModes: [MatchExitMode.CANCEL_RESULTS],
              blockedReasons: [],
            },
          }),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'THOÁT TRẬN' }));
    await user.click(screen.getByRole('button', { name: /Hủy kết quả/ }));
    await user.click(screen.getByRole('button', { name: 'Hủy kết quả' }));

    expect(exitMatch).toHaveBeenCalledWith(MatchExitMode.CANCEL_RESULTS);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText('Máy chủ từ chối thao tác này.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hủy kết quả' })).toBeEnabled();
  });

  it('keeps saving visible but disabled before round 2 is complete, using the server reason', () => {
    render(
      <InspectorConsole
        realtime={createRealtimeState({ snapshot: snapshotFor(MatchStatus.BREAK) })}
      />,
    );

    expect(screen.getByRole('button', { name: 'LƯU KẾT QUẢ' })).toBeDisabled();
    expect(screen.getByText(/Hiệp 2 chưa kết thúc/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeVisible();
  });

  it('enables save only from the authoritative completion capability and completes after confirmation', async () => {
    const user = userEvent.setup();
    const completeMatch = vi.fn(() => Promise.resolve(true));
    render(
      <InspectorConsole
        realtime={createRealtimeState({
          completeMatch,
          snapshot: createMatchSnapshot({
            ...snapshotFor(MatchStatus.AWAITING_RESULT_SAVE),
            completion: { canComplete: true, blockedReasons: [] },
          }),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'LƯU KẾT QUẢ' }));
    expect(completeMatch).not.toHaveBeenCalled();
    expect(screen.getByText(/Xác nhận lưu kết quả chính thức/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Lưu kết quả' }));
    expect(completeMatch).toHaveBeenCalledOnce();
  });
});
