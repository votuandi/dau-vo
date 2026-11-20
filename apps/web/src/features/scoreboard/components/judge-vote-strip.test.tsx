import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AthleteColor, type PublicMatchStatePayload } from '@martial-arts-scoring/shared-types';
import { JUDGE_VOTE_HOLD_MS } from '../scoreboard-view-model';
import { JudgeVoteStrip } from './judge-vote-strip';

const RESOLVED_AT = '2030-01-01T00:00:00.000Z';

function judgeVotes(
  winningColor: AthleteColor | null,
  votes: readonly AthleteColor[],
): PublicMatchStatePayload['judgeVotes'] {
  return {
    judgeCount: 3,
    lastResolvedWindow: {
      resolvedAt: RESOLVED_AT,
      winningColor,
      votes: votes.map((athlete, index) => ({ judgePosition: index + 1, athlete })),
    },
  };
}

function strip(): HTMLElement {
  return screen.getByRole('region', { name: 'Giám định chấm điểm' });
}

describe('JudgeVoteStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RESOLVED_AT));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [AthleteColor.RED, 'bg-red-800/85'],
    [AthleteColor.BLUE, 'bg-blue-900/85'],
  ])('takes the colour of the highlighted athlete (%s)', (winner, surface) => {
    const votes = judgeVotes(winner, [winner, winner]);
    const { rerender } = render(
      <JudgeVoteStrip awarded={winner} generatedAt={RESOLVED_AT} judgeVotes={votes} />,
    );
    expect(strip()).toHaveClass(surface);
    expect(strip()).toHaveAttribute('data-awarded', winner);

    // When the highlight ends the strip turns neutral but the votes stay on show.
    rerender(<JudgeVoteStrip awarded={null} generatedAt={RESOLVED_AT} judgeVotes={votes} />);
    expect(strip()).toHaveClass('bg-white/10');
    expect(strip()).toHaveAttribute('data-awarded', 'NONE');
    expect(
      screen.getByLabelText(`Giám định 1: ${winner === AthleteColor.RED ? 'Đỏ' : 'Xanh'}`),
    ).toBeVisible();
  });

  it('shows each judge vote and the result for the hold period', () => {
    render(
      <JudgeVoteStrip
        generatedAt={RESOLVED_AT}
        judgeVotes={judgeVotes(AthleteColor.RED, [AthleteColor.RED, AthleteColor.BLUE])}
      />,
    );
    expect(screen.getByText('Cộng điểm cho ĐỎ')).toBeVisible();
    expect(screen.getByLabelText('Giám định 2: Xanh')).toBeVisible();
    expect(screen.getByLabelText('Giám định 3: không chọn')).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(JUDGE_VOTE_HOLD_MS + 50);
    });
    expect(screen.queryByText('Cộng điểm cho ĐỎ')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Giám định 2: không chọn')).toBeVisible();
  });

  it('shows the supervisor vote in a TT cell after the judges', () => {
    const votes = judgeVotes(AthleteColor.BLUE, [AthleteColor.BLUE, AthleteColor.RED]);
    render(
      <JudgeVoteStrip
        generatedAt={RESOLVED_AT}
        judgeVotes={{
          ...votes,
          supervisorVoting: true,
          lastResolvedWindow: votes.lastResolvedWindow && {
            ...votes.lastResolvedWindow,
            supervisorVote: AthleteColor.BLUE,
          },
        }}
      />,
    );
    const cells = screen.getAllByRole('listitem');
    expect(cells.map((cell) => cell.textContent)).toEqual(['GĐ 1', 'GĐ 2', 'GĐ 3', 'TT']);
    expect(screen.getByLabelText('Trọng tài (TT): Xanh')).toHaveAttribute('data-vote', 'BLUE');
  });

  it('keeps the neutral surface when no athlete reaches a majority', () => {
    render(
      <JudgeVoteStrip
        generatedAt={RESOLVED_AT}
        judgeVotes={judgeVotes(null, [AthleteColor.RED, AthleteColor.BLUE])}
      />,
    );
    expect(strip()).toHaveClass('bg-white/10');
    expect(screen.getByText('Không đủ đa số — không cộng điểm')).toBeVisible();
  });
});
