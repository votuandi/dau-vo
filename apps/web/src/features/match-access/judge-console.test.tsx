import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AthleteColor,
  MatchStatus,
  ScoringMethod,
  type MatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import { JudgeConsole } from './judge-console';
import { acceptedRedVote, createRealtimeState, createMatchSnapshot } from '@/test/factories';

describe('JudgeConsole', () => {
  it.each([MatchStatus.ROUND_1_PAUSED, MatchStatus.ROUND_2_PAUSED, MatchStatus.OVERTIME_PAUSED])(
    'allows scoring while %s without advancing the frozen timer',
    async (phase) => {
      const user = userEvent.setup();
      const submitVote = vi.fn(() => Promise.resolve());
      const base = createMatchSnapshot();
      if (!base.activeRound) throw new Error('Missing round');
      render(
        <JudgeConsole
          realtime={createRealtimeState({
            submitVote,
            snapshot: {
              ...base,
              match: { ...base.match, phase, status: phase },
              activeRound: {
                ...base.activeRound,
                pausedAt: '2026-09-01T12:01:00Z',
                remainingDurationMs: 60_000,
              },
            },
          })}
        />,
      );
      expect(screen.getByRole('timer')).toHaveTextContent('01:00');
      await user.click(screen.getByRole('button', { name: /Chấm điểm RED/i }));
      expect(submitVote).toHaveBeenCalledWith(AthleteColor.RED);
    },
  );

  it('only presents a vote as recorded after the accepted-vote state arrives', () => {
    const { rerender } = render(
      <JudgeConsole realtime={createRealtimeState({ submittingVote: AthleteColor.RED })} />,
    );

    expect(screen.getByText('Đã gửi lựa chọn RED; đang chờ máy chủ xác nhận.')).toBeVisible();
    expect(screen.queryByText(/Máy chủ đã ghi nhận lựa chọn/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();

    rerender(
      <JudgeConsole realtime={createRealtimeState({ lastAcceptedVote: acceptedRedVote })} />,
    );

    expect(screen.getByText(/Máy chủ đã ghi nhận lựa chọn RED/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();
  });

  it('prevents another vote after an accepted vote and enables both controls for a new window', async () => {
    const user = userEvent.setup();
    const submitVote = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <JudgeConsole
        realtime={createRealtimeState({ lastAcceptedVote: acceptedRedVote, submitVote })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Chấm điểm BLUE/i }));
    expect(submitVote).not.toHaveBeenCalled();

    rerender(
      <JudgeConsole
        realtime={createRealtimeState({
          snapshot: createMatchSnapshot({
            activeScoringWindow: null,
          }),
          submitVote,
        })}
      />,
    );

    const redButton = screen.getByRole('button', { name: /Chấm điểm RED/i });
    const blueButton = screen.getByRole('button', { name: /Chấm điểm BLUE/i });
    expect(redButton).toBeEnabled();
    expect(blueButton).toBeEnabled();

    await user.click(blueButton);
    expect(submitVote).toHaveBeenCalledExactlyOnceWith(AthleteColor.BLUE);
  });

  it.each([
    ['disconnected', 'Mất kết nối'],
    ['reconnecting', 'Đang kết nối lại'],
  ] as const)('shows %s as %s and disables voting', (connectionStatus, label) => {
    render(<JudgeConsole realtime={createRealtimeState({ connectionStatus })} />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();
  });
});

function refereeCommandSnapshot(
  phase: MatchStatus,
  activeScoringWindow: MatchStatePayload['activeScoringWindow'] = null,
): MatchStatePayload {
  const base = createMatchSnapshot();
  if (!base.activeRound) throw new Error('Missing round');
  const paused = phase === MatchStatus.ROUND_1_PAUSED;
  return {
    ...base,
    activeRound: {
      ...base.activeRound,
      pausedAt: paused ? '2026-09-01T12:01:00Z' : null,
      remainingDurationMs: paused ? 60_000 : null,
    },
    activeScoringWindow,
    match: { ...base.match, phase, scoringMethod: ScoringMethod.REFEREE_COMMAND, status: phase },
  };
}

const openRefereeWindow = {
  attemptNumber: 0,
  endsAt: null,
  id: 'window-1',
  roundNumber: 1,
  stage: 'REGULATION',
  startedAt: '2026-09-01T12:01:00Z',
} as const;

describe('JudgeConsole referee-command scoring', () => {
  it('disables both choices while the round runs before the supervisor opens scoring', () => {
    render(
      <JudgeConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_RUNNING),
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Chấm điểm BLUE/i })).toBeDisabled();
    expect(screen.getByText(/Lựa chọn chỉ mở khi Giám sát bấm Chấm điểm/)).toBeVisible();
  });

  it('keeps choices disabled during an ordinary pause', () => {
    render(
      <JudgeConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED),
        })}
      />,
    );
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toBeDisabled();
    expect(screen.getByText('Hiệp đấu đang tạm dừng. Không thể chấm điểm.')).toBeVisible();
  });

  it('opens both choices while scoring is open', async () => {
    const user = userEvent.setup();
    const submitVote = vi.fn(() => Promise.resolve());
    render(
      <JudgeConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
          submitVote,
        })}
      />,
    );
    expect(screen.getByText('Đang chấm điểm theo hiệu lệnh trọng tài.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Chấm điểm BLUE/i }));
    expect(submitVote).toHaveBeenCalledWith(AthleteColor.BLUE);
  });

  it('turns blue-purple-red while judges score and amber for an ordinary pause', () => {
    const { container, rerender } = render(
      <JudgeConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
        })}
      />,
    );
    expect(container.firstElementChild).toHaveClass('via-purple-900');
    rerender(
      <JudgeConsole
        realtime={createRealtimeState({
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED),
        })}
      />,
    );
    expect(container.firstElementChild).toHaveClass('via-yellow-800');
    expect(container.firstElementChild).not.toHaveClass('via-purple-900');
  });

  it('lets a judge change an accepted choice until the supervisor resumes', async () => {
    const user = userEvent.setup();
    const submitVote = vi.fn(() => Promise.resolve());
    render(
      <JudgeConsole
        realtime={createRealtimeState({
          lastAcceptedVote: acceptedRedVote,
          snapshot: refereeCommandSnapshot(MatchStatus.ROUND_1_PAUSED, openRefereeWindow),
          submitVote,
        })}
      />,
    );
    expect(screen.getByText(/Có thể đổi lựa chọn cho đến khi Giám sát bấm Tiếp tục/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Chấm điểm RED/i })).toHaveTextContent(
      '✓ Đã ghi nhận',
    );
    await user.click(screen.getByRole('button', { name: /Chấm điểm BLUE/i }));
    expect(submitVote).toHaveBeenCalledWith(AthleteColor.BLUE);
  });
});
