import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AthleteColor,
  FaultSeverity,
  MatchAccessRole,
  MatchExitMode,
  MatchStatus,
  ScoringMethod,
  type MatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import { SupervisorConsole } from './supervisor-console';
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

describe('SupervisorConsole', () => {
  it('sends direct adjustments for each athlete while running or paused', async () => {
    const user = userEvent.setup();
    const adjustScore = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
          adjustScore,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cộng 1 điểm VĐV đỏ' }));
    await user.click(screen.getByRole('button', { name: 'Trừ 1 điểm VĐV xanh' }));
    expect(adjustScore).toHaveBeenNthCalledWith(1, AthleteColor.RED, 1);
    expect(adjustScore).toHaveBeenNthCalledWith(2, AthleteColor.BLUE, -1);
    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_1_PAUSED),
          adjustScore,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cộng 1 điểm VĐV đỏ' }));
    expect(adjustScore).toHaveBeenNthCalledWith(3, AthleteColor.RED, 1);
  });

  it('locks Lịch sử chấm điểm only while an authoritative round is running', () => {
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({ snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING) })}
      />,
    );
    expect(screen.getByRole('button', { name: /lịch sử chấm điểm/i })).toBeDisabled();

    for (const status of [
      MatchStatus.ROUND_1_PAUSED,
      MatchStatus.BREAK,
      MatchStatus.REGULATION_APPEAL,
      MatchStatus.FINISHED,
    ]) {
      rerender(
        <SupervisorConsole realtime={createRealtimeState({ snapshot: snapshotFor(status) })} />,
      );
      expect(screen.getByRole('button', { name: /lịch sử chấm điểm/i })).toBeEnabled();
    }
  });

  it('guards Lịch sử chấm điểm until an authoritative match snapshot exists', () => {
    render(<SupervisorConsole realtime={createRealtimeState({ snapshot: null })} />);
    expect(screen.getByRole('button', { name: /lịch sử chấm điểm/i })).toBeDisabled();
  });

  it('hides an expired intermission countdown without starting Round 2', async () => {
    const user = userEvent.setup();
    const startRound = vi.fn(() => Promise.resolve());
    const expiredDeadline = new Date(Date.now() - 1_000).toISOString();
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: createMatchSnapshot({
            activeRound: null,
            generatedAt: new Date().toISOString(),
            match: {
              ...snapshotFor(MatchStatus.BREAK).match,
              intermissionEndsAt: expiredDeadline,
              phase: MatchStatus.BREAK,
              status: MatchStatus.BREAK,
            },
          }),
          startRound,
        })}
      />,
    );

    expect(screen.queryByRole('timer', { name: /giải lao còn lại/u })).not.toBeInTheDocument();
    expect(startRound).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 2' }));
    expect(startRound).toHaveBeenCalledOnce();
  });

  it('keeps the appeal presentation after Lịch sử chấm điểm closes', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SupervisorConsole
          realtime={createRealtimeState({ snapshot: snapshotFor(MatchStatus.REGULATION_APPEAL) })}
        />
      </QueryClientProvider>,
    );

    expect(container.firstElementChild).toHaveClass('from-amber-950');
    await user.click(screen.getByRole('button', { name: /lịch sử chấm điểm/i }));
    expect(screen.getByRole('dialog', { name: /lịch sử chấm điểm/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Đóng' }));

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SupervisorConsole
          realtime={createRealtimeState({ snapshot: snapshotFor(MatchStatus.REGULATION_APPEAL) })}
        />
      </QueryClientProvider>,
    );
    expect(container.firstElementChild).toHaveClass('from-amber-950');
  });

  it('enables completing an appeal when every adjustment is zero', () => {
    const base = snapshotFor(MatchStatus.REGULATION_APPEAL);
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: {
            ...base,
            result: {
              ...base.result,
              regulationAppeal: {
                ...base.result.regulationAppeal,
                canComplete: true,
                blockedReasons: [],
              },
            },
          },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'HOÀN THÀNH PHÚC KHẢO' })).toBeEnabled();
  });

  it('renders the authoritative WAITING → Round 1 → BREAK → Round 2 → FINISHED workflow', async () => {
    const user = userEvent.setup();
    const startRound = vi.fn(() => Promise.resolve());
    const submitFault = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.WAITING),
          startRound,
          submitFault,
        })}
      />,
    );

    expect(screen.getByText('CHỜ BẮT ĐẦU')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 1' }));
    expect(startRound).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' })).toBeDisabled();

    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
          startRound,
          submitFault,
        })}
      />,
    );

    expect(screen.getByText('HIỆP 1')).toBeVisible();
    expect(screen.getByText('Nguyễn Văn Đỏ')).toBeVisible();
    expect(screen.getAllByText(/Lỗi nhẹ:/u)).toHaveLength(2);
    expect(screen.getAllByText(/Lỗi nặng:/u)).toHaveLength(2);
    expect(screen.getAllByText('5')).toHaveLength(1);
    expect(screen.getAllByText('3')).toHaveLength(1);
    const redFault = screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' });
    await user.click(redFault);
    expect(submitFault).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' })).toHaveTextContent(
      'XÁC NHẬN',
    );
    await user.click(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' }));
    expect(submitFault).toHaveBeenCalledExactlyOnceWith(AthleteColor.RED, FaultSeverity.MINOR);

    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.BREAK),
          startRound,
          submitFault,
        })}
      />,
    );

    expect(screen.getByText('NGHỈ GIỮA HIỆP')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 2' }));
    expect(startRound).toHaveBeenCalledTimes(2);

    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.ROUND_2_RUNNING),
          startRound,
          submitFault,
        })}
      />,
    );

    expect(screen.getByText('HIỆP 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nặng VĐV XANH' })).toBeEnabled();

    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: snapshotFor(MatchStatus.FINISHED),
          startRound,
          submitFault,
        })}
      />,
    );

    expect(screen.getByText('KẾT QUẢ CUỐI CÙNG')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nặng VĐV XANH' })).toBeDisabled();
  });

  it('disables controls when the session is revoked or realtime connection is lost', () => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          connectionStatus: 'revoked',
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
        })}
      />,
    );

    expect(screen.getByText('Mất kết nối')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nặng VĐV XANH' })).toBeDisabled();
  });

  it('enables fault recording for a running legacy match', () => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: createMatchSnapshot({
            match: {
              ...snapshotFor(MatchStatus.ROUND_1_RUNNING).match,
              rulesVersion: 'LEGACY_SCORE_PENALTY_V1',
            },
          }),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nặng VĐV XANH' })).toBeEnabled();
  });

  it('shows match-scoped readiness on hover and disables round start until every required display is connected', async () => {
    const user = userEvent.setup();
    const presence = createMatchSnapshot().presence.map((entry) =>
      entry.accessRole === MatchAccessRole.JUDGE_2
        ? { ...entry, connected: false, connectedSocketCount: 0 }
        : entry,
    );

    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          presence,
          snapshot: createMatchSnapshot({
            ...snapshotFor(MatchStatus.WAITING),
            readiness: {
              canStartRound: false,
              kind: 'LEGACY_MATCH_ACCESS',
              missingRequirements: ['JUDGE_2'],
              requiredJudgeCount: 3,
              referees: { JUDGE_1: true, JUDGE_2: false, JUDGE_3: true },
              scoreboardConnectedCount: 1,
            },
          }),
        })}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Sẵn sàng trận đấu' })).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Chưa sẵn sàng' }));
    expect(screen.getByRole('heading', { name: 'Sẵn sàng trận đấu' })).toBeVisible();
    expect(screen.getByText('Giám định 1 đã kết nối')).toBeVisible();
    expect(screen.getByText('Giám định 2 chưa kết nối')).toBeVisible();
    expect(screen.getByText('Bảng điểm đã kết nối (1)')).toBeVisible();
    expect(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 1' })).toBeDisabled();
    expect(
      screen.getByText(
        'Chưa thể bắt đầu hiệp đấu. Đã phân công 3/3 giám định, kết nối 2/3 giám định và 1 bảng điểm.',
      ),
    ).toBeVisible();
  });

  it('keeps round start locked while freshness is pending after a presence update', () => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          readinessFresh: false,
          snapshot: snapshotFor(MatchStatus.WAITING),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'BẮT ĐẦU HIỆP 1' })).toBeDisabled();
  });

  it('pauses and resumes directly without a confirmation dialog', async () => {
    const user = userEvent.setup();
    const pauseRound = vi.fn(() => Promise.resolve(true));
    const resumeRound = vi.fn(() => Promise.resolve(true));
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({
          pauseRound,
          snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'TẠM DỪNG' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pauseRound).toHaveBeenCalledOnce();

    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          resumeRound,
          snapshot: snapshotFor(MatchStatus.ROUND_1_PAUSED),
        })}
      />,
    );
    expect(screen.getByText('HIỆP 1 TẠM DỪNG')).toBeVisible();
    expect(screen.getByRole('timer')).toHaveTextContent('01:00');
    expect(screen.getByRole('button', { name: 'Ghi nhận Lỗi nhẹ VĐV ĐỎ' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'TIẾP TỤC' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(resumeRound).toHaveBeenCalledOnce();
  });

  it('uses confirmation dialogs for round cancellation and destructive match exit', async () => {
    const user = userEvent.setup();
    const cancelRoundResult = vi.fn(() => Promise.resolve(true));
    const exitMatch = vi.fn(() => Promise.resolve(true));
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({
          cancelRoundResult,
          snapshot: snapshotFor(MatchStatus.BREAK),
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'HỦY KẾT QUẢ HIỆP 1 VÀ BẮT ĐẦU LẠI' }));
    expect(cancelRoundResult).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByText(/Tất cả điểm giám định và lỗi trong Hiệp 1/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy kết quả hiệp' }));
    expect(cancelRoundResult).toHaveBeenCalledOnce();

    rerender(
      <SupervisorConsole
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
      <SupervisorConsole
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
      <SupervisorConsole
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
    render(<SupervisorConsole realtime={createRealtimeState({ snapshot: null })} />);

    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeDisabled();
    expect(screen.getByText('Đang đồng bộ các lựa chọn thoát trận từ máy chủ.')).toBeVisible();
  });

  it('only reports that exit is unavailable when the authoritative capability forbids it', () => {
    render(
      <SupervisorConsole
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
      <SupervisorConsole
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
      <SupervisorConsole
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
      <SupervisorConsole
        realtime={createRealtimeState({ snapshot: snapshotFor(MatchStatus.BREAK) })}
      />,
    );

    expect(screen.getByRole('button', { name: 'LƯU KẾT QUẢ' })).toBeDisabled();
    expect(screen.getByText(/Hiệp 2 chưa kết thúc/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'THOÁT TRẬN' })).toBeVisible();
  });

  it('enables save only from the authoritative completion capability and completes after confirmation', async () => {
    const user = userEvent.setup();
    const publishResult = vi.fn(() => Promise.resolve(true));
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          publishResult,
          snapshot: createMatchSnapshot({
            ...snapshotFor(MatchStatus.AWAITING_RESULT_SAVE),
            completion: { canComplete: true, blockedReasons: [] },
          }),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'LƯU KẾT QUẢ' }));
    expect(publishResult).not.toHaveBeenCalled();
    expect(screen.getByText(/Xác nhận lưu kết quả chính thức/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Lưu kết quả' }));
    expect(publishResult).toHaveBeenCalledOnce();
  });
});

function refereeCommandSnapshot(
  status: MatchStatus,
  activeScoringWindow: MatchStatePayload['activeScoringWindow'] = null,
): MatchStatePayload {
  const snapshot = snapshotFor(status);
  return {
    ...snapshot,
    activeScoringWindow,
    match: { ...snapshot.match, scoringMethod: ScoringMethod.REFEREE_COMMAND },
  };
}

const openRefereeWindow = {
  attemptNumber: 0,
  endsAt: null,
  id: 'window-referee',
  roundNumber: 1,
  stage: 'REGULATION',
  startedAt: '2026-09-01T12:01:00.000Z',
} as const;

describe('SupervisorConsole referee-command scoring', () => {
  it('never offers CHẤM ĐIỂM for a free 1.5 s window match', () => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({ snapshot: snapshotFor(MatchStatus.ROUND_1_RUNNING) })}
      />,
    );
    expect(screen.getByRole('button', { name: 'TẠM DỪNG' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'TẠM DỪNG' }).parentElement).not.toHaveClass(
      'grid-cols-2',
    );
    expect(screen.queryByRole('button', { name: 'CHẤM ĐIỂM' })).not.toBeInTheDocument();
  });

  it('offers CHẤM ĐIỂM beside TẠM DỪNG while a referee-command round runs', async () => {
    const user = userEvent.setup();
    const startScoring = vi.fn(() => Promise.resolve(true));
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_RUNNING),
          startScoring,
        })}
      />,
    );
    const pause = screen.getByRole('button', { name: 'TẠM DỪNG' });
    const score = screen.getByRole('button', { name: 'CHẤM ĐIỂM' });
    expect(pause).toBeEnabled();
    // Left and right in one two-column row, pause first.
    expect(pause.parentElement).toBe(score.parentElement);
    expect(pause.parentElement).toHaveClass('grid-cols-2');
    expect(pause.compareDocumentPosition(score) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(score);
    expect(startScoring).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'TIẾP TỤC' })).not.toBeInTheDocument();
  });

  it('turns blue-purple-red while judges score and amber for an ordinary pause', () => {
    const { container, rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
        })}
      />,
    );
    expect(container.firstElementChild).toHaveClass('via-purple-900');
    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED),
        })}
      />,
    );
    expect(container.firstElementChild).toHaveClass('via-yellow-800');
  });

  it('shows only TIẾP TỤC while judges score, which closes the scoring', async () => {
    const user = userEvent.setup();
    const resumeRound = vi.fn(() => Promise.resolve(true));
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          resumeRound,
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'CHẤM ĐIỂM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'TẠM DỪNG' })).not.toBeInTheDocument();
    expect(screen.getByText(/Giám định đang chấm điểm/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'TIẾP TỤC' }));
    expect(resumeRound).toHaveBeenCalledTimes(1);
  });

  it('keeps an ordinary pause without CHẤM ĐIỂM in referee-command mode', () => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED),
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'TIẾP TỤC' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'CHẤM ĐIỂM' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Giám định đang chấm điểm/)).not.toBeInTheDocument();
  });

  it('disables CHẤM ĐIỂM while disconnected or while a round command is pending', () => {
    const snapshot = refereeCommandSnapshot(MatchStatus.ROUND_1_RUNNING);
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({ connectionStatus: 'reconnecting', snapshot })}
      />,
    );
    expect(screen.getByRole('button', { name: 'CHẤM ĐIỂM' })).toBeDisabled();
    rerender(
      <SupervisorConsole realtime={createRealtimeState({ controllingRound: true, snapshot })} />,
    );
    expect(screen.getAllByRole('button', { name: 'ĐANG XỬ LÝ…' })).toHaveLength(2);
    for (const button of screen.getAllByRole('button', { name: 'ĐANG XỬ LÝ…' }))
      expect(button).toBeDisabled();
  });
});

describe('SupervisorConsole supervisor (TT) scoring', () => {
  function supervisedSnapshot(
    status: MatchStatus,
    window: MatchStatePayload['activeScoringWindow'] = null,
    enabled = true,
  ): MatchStatePayload {
    const snapshot = refereeCommandSnapshot(status, window);
    return { ...snapshot, match: { ...snapshot.match, supervisorScoringEnabled: enabled } };
  }

  it('lets the supervisor pick an athlete by tapping its card while judges score', async () => {
    const user = userEvent.setup();
    const submitSupervisorVote = vi.fn(() => Promise.resolve());
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: supervisedSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
          submitSupervisorVote,
        })}
      />,
    );
    expect(
      screen.getByText(/Chạm vào ô tên VĐV để chấm điểm như một giám định \(TT\)/),
    ).toBeVisible();
    const blue = screen.getByRole('button', { name: 'TT chọn XANH — Trần Văn Xanh' });
    expect(blue).toHaveAttribute('aria-pressed', 'false');
    await user.click(blue);
    expect(submitSupervisorVote).toHaveBeenCalledWith(AthleteColor.BLUE);
  });

  it('marks only the choice made in the stop that is open now', () => {
    const vote = {
      athlete: AthleteColor.RED,
      matchPublicId: 'A72K9P',
      scoringWindowId: openRefereeWindow.id,
      serverReceivedAt: '2026-09-01T12:01:01.000Z',
    };
    const { rerender } = render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: supervisedSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
          supervisorVote: vote,
        })}
      />,
    );
    const red = screen.getByRole('button', { name: 'TT chọn ĐỎ — Nguyễn Văn Đỏ' });
    expect(red).toHaveAttribute('aria-pressed', 'true');
    expect(red).toHaveTextContent('✓ TT đã chọn');

    rerender(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: supervisedSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
          supervisorVote: { ...vote, scoringWindowId: 'an-earlier-stop' },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'TT chọn ĐỎ — Nguyễn Văn Đỏ' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it.each([
    ['the round setting is off', MatchStatus.ROUND_1_PAUSED, openRefereeWindow, false],
    ['the round is running', MatchStatus.ROUND_1_RUNNING, null, true],
    ['the round is paused without scoring', MatchStatus.ROUND_1_PAUSED, null, true],
  ] as const)('keeps the cards read-only when %s', (_case, status, window, enabled) => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({ snapshot: supervisedSnapshot(status, window, enabled) })}
      />,
    );
    expect(screen.queryByRole('button', { name: /^TT chọn/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Võ sĩ RED' })).toBeVisible();
  });

  it('shows why a supervisor vote was rejected', () => {
    render(
      <SupervisorConsole
        realtime={createRealtimeState({
          snapshot: supervisedSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
          voteSubmitErrorMessage: 'Chỉ có thể chấm điểm khi Giám sát đã bấm Chấm điểm.',
        })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chỉ có thể chấm điểm khi Giám sát đã bấm Chấm điểm.',
    );
  });
});
