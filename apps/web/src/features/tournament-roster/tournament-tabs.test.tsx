import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TournamentTabs } from './tournament-tabs';

function renderMenu(active: Parameters<typeof TournamentTabs>[0]['active']) {
  render(
    <MemoryRouter>
      <TournamentTabs active={active} tournamentId="tournament-1" />
    </MemoryRouter>,
  );
  return screen.getByRole('navigation', { name: 'Khu vực quản lý giải đấu' });
}

describe('TournamentTabs', () => {
  it('lists every management area in order with its route', () => {
    const links = within(renderMenu('info')).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Thông tin', '/admin/tournaments/tournament-1'],
      ['Hạng cân', '/admin/tournaments/tournament-1/weight-classes'],
      ['Đơn vị tham gia', '/admin/tournaments/tournament-1/organizations'],
      ['Vận động viên', '/admin/tournaments/tournament-1/athletes'],
      ['Trận đấu', '/admin/tournaments/tournament-1/matches'],
      ['Giám định', '/admin/tournaments/tournament-1/judges'],
      ['Giám sát', '/admin/tournaments/tournament-1/supervisors'],
    ]);
  });

  it('marks only the active area as the current page', () => {
    const nav = renderMenu('matches');
    expect(within(nav).getByRole('link', { name: 'Trận đấu' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('stacks vertically as a left menu on large screens', () => {
    const nav = renderMenu('info');
    expect(nav).toHaveClass('lg:sticky');
    expect(within(nav).getAllByRole('link')[0]?.parentElement).toHaveClass('lg:flex-col');
  });
});
