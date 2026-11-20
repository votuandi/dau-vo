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

  it('gives an upcoming match no actions', () => {
    renderList();
    const item = screen.getByText('Trận UP1').closest('li');
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    expect(within(item as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });
});
