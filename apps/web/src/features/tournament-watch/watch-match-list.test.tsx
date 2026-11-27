import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AthleteColor, MatchDisplayState, MatchLifecycle, MatchPhase } from '@/types/shared';
import type { WatchMatch } from '@/services/api/watch';
import { WatchMatchList } from './watch-match-list';

function match(
  publicId: string,
  lifecycle: MatchLifecycle,
  displayState: MatchDisplayState,
  phase: MatchPhase,
): WatchMatch {
  return {
    kind: 'MATCH',
    manualDecision: null,
    id: `id-${publicId}`,
    publicId,
    lifecycle,
    phase,
    displayState,
    currentRound: null,
    regulationRoundCount: 2,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-11-20T08:00:00.000Z',
    weightClass: { id: 'w', name: 'Nam 54kg' },
    bracketRound: null,
    athletes: [
      { color: AthleteColor.RED, name: `Đỏ ${publicId}`, organization: null, imageUrl: null },
      { color: AthleteColor.BLUE, name: `Xanh ${publicId}`, organization: null, imageUrl: null },
    ],
    score: null,
    winnerColor: null,
  };
}

const matches = [
  match('UP1', MatchLifecycle.READY, MatchDisplayState.READY, MatchPhase.WAITING),
  match('DONE1', MatchLifecycle.COMPLETED, MatchDisplayState.COMPLETED, MatchPhase.FINISHED),
  match(
    'LIVE1',
    MatchLifecycle.IN_PROGRESS,
    MatchDisplayState.IN_PROGRESS,
    MatchPhase.ROUND_1_RUNNING,
  ),
];

function renderList() {
  render(
    <MemoryRouter>
      <WatchMatchList matches={matches} tournamentCode="ABC234" />
    </MemoryRouter>,
  );
}

describe('WatchMatchList', () => {
  it('lists live, then finished, then upcoming matches', () => {
    renderList();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Đang diễn ra1', 'Đã diễn ra1', 'Chưa diễn ra1']);
  });

  it('shows both actions for a live match once it is clicked', async () => {
    renderList();
    expect(screen.queryByText('Xem trực tiếp')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Trận LIVE1/ }));
    const live = screen.getByRole('link', { name: 'Xem trực tiếp' });
    expect(live).toHaveAttribute('href', '/bang-diem?match=LIVE1');
    expect(screen.getByRole('link', { name: 'Kết quả chi tiết' })).toHaveAttribute(
      'href',
      '/watch/ABC234/matches/LIVE1',
    );
  });

  it('disables live viewing for a finished match', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: /Trận DONE1/ }));
    expect(screen.getByRole('button', { name: 'Xem trực tiếp' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Kết quả chi tiết' })).toBeInTheDocument();
  });

  it('shows the score between both athletes once a match is finished, and VS before', () => {
    render(
      <MemoryRouter>
        <WatchMatchList
          matches={[
            {
              ...match(
                'DONE2',
                MatchLifecycle.COMPLETED,
                MatchDisplayState.COMPLETED,
                MatchPhase.FINISHED,
              ),
              score: { RED: 8, BLUE: 3 },
              winnerColor: AthleteColor.RED,
            },
            match('UP2', MatchLifecycle.READY, MatchDisplayState.READY, MatchPhase.WAITING),
          ]}
          tournamentCode="ABC234"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: 'Tỉ số 8 – 3, giáp đỏ thắng' })).toBeInTheDocument();
    const upcoming = screen.getByText('Trận UP2').closest('li') as HTMLElement;
    expect(within(upcoming).getByText('VS')).toBeInTheDocument();
  });

  it('filters by status and searches by athlete name without diacritics', async () => {
    renderList();
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), 'finished');
    expect(screen.getByText('Trận DONE1')).toBeInTheDocument();
    expect(screen.queryByText('Trận LIVE1')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Trạng thái'), '');
    await userEvent.type(screen.getByLabelText('Tìm kiếm trận đấu'), 'xanh live1');
    expect(screen.getByText('Trận LIVE1')).toBeInTheDocument();
    expect(screen.queryByText('Trận UP1')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Tìm kiếm trận đấu'), 'khong co');
    expect(screen.getByText('Không có trận đấu phù hợp với bộ lọc.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(screen.getByText('Trận UP1')).toBeInTheDocument();
  });

  it('shows a fixture decided without a match as finished, with the decision and no actions', () => {
    render(
      <MemoryRouter>
        <WatchMatchList
          matches={[
            {
              ...match(
                'X',
                MatchLifecycle.COMPLETED,
                MatchDisplayState.COMPLETED,
                MatchPhase.FINISHED,
              ),
              kind: 'DECIDED_FIXTURE',
              publicId: null,
              id: 'fixture-1',
              bracketRound: {
                roundNumber: 1,
                position: 13,
                displayReference: 'R1-M13',
                label: 'Vòng 1',
              },
              winnerColor: AthleteColor.BLUE,
              manualDecision: { type: 'WITHDRAWAL_OR_INJURY', reason: 'Chấn thương' },
            },
          ]}
          tournamentCode="ABC234"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Đã diễn ra');
    expect(screen.getByText('Trận R1-M13')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Chỉ định giáp xanh thắng' })).toBeInTheDocument();
    expect(
      screen.getByText('Thắng do đối thủ bỏ cuộc hoặc chấn thương', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lý do: Chấn thương/)).toBeInTheDocument();
    const item = screen.getByText('Trận R1-M13').closest('li') as HTMLElement;
    expect(within(item).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the current score for an in-progress match', () => {
    render(
      <MemoryRouter>
        <WatchMatchList
          matches={[
            {
              ...match(
                'LIVE2',
                MatchLifecycle.IN_PROGRESS,
                MatchDisplayState.IN_PROGRESS,
                MatchPhase.ROUND_1_RUNNING,
              ),
              score: { RED: 4, BLUE: 2 },
            },
          ]}
          tournamentCode="ABC234"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: 'Tỉ số 4 – 2' })).toBeInTheDocument();
  });

  it('gives an upcoming match no actions', () => {
    renderList();
    const item = screen.getByText('Trận UP1').closest('li');
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    expect(within(item as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });
});
