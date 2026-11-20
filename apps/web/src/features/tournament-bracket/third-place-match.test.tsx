import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from '@/services/api/admin-management';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { bracketChartPresentation } from './bracket-chart-presentation';
import { FixtureList } from './fixture-list';
import { thirdPlaceLockReason } from './fixture-presentation';
import { ThirdPlaceMatchToggle } from './third-place-match-toggle';

const api = vi.hoisted(() => ({ updateThirdPlaceMatch: vi.fn() }));
vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));

const entrant = (id: string) => ({
  id,
  snapshotName: `VĐV ${id}`,
  snapshotOrganization: null,
  snapshotImagePath: null,
  isSeed: false,
});
type Slot = ActiveBracket['fixtures'][number]['slots'][number];
const winnerOf = (fixtureId: string, side: 'RED' | 'BLUE'): Slot => ({
  side,
  sourceFixtureId: fixtureId,
  sourceOutcome: 'WINNER',
  directEntrant: null,
  resolvedEntrant: null,
});
const loserOf = (fixtureId: string, side: 'RED' | 'BLUE'): Slot => ({
  ...winnerOf(fixtureId, side),
  sourceOutcome: 'LOSER',
});
const direct = (id: string, side: 'RED' | 'BLUE'): Slot => ({
  side,
  sourceFixtureId: null,
  directEntrant: entrant(id),
  resolvedEntrant: entrant(id),
});
const fixture = (
  id: string,
  roundNumber: number,
  position: number,
  displayReference: string,
  slots: Slot[],
  status = 'PENDING_PARTICIPANTS',
) =>
  ({
    id,
    roundNumber,
    position,
    displayReference,
    status,
    displayState: MatchDisplayState.NOT_READY,
    match: null,
    winnerEntrant: null,
    slots,
  }) as ActiveBracket['fixtures'][number];

/** Four athletes: two semi-finals, the final, and the third-place match stored as round 3. */
function bracket(overrides: Partial<ActiveBracket['bracket']> = {}, thirdStatus?: string) {
  return {
    bracket: {
      id: 'b-1',
      status: 'ACTIVE',
      athleteCount: 4,
      bracketSize: 4,
      roundCount: 2,
      confirmedAt: '',
      championEntrant: null,
      ...overrides,
    },
    entrants: [],
    fixtures: [
      fixture('sf1', 1, 1, 'R1-M01', [direct('a', 'RED'), direct('b', 'BLUE')], 'READY'),
      fixture('sf2', 1, 2, 'R1-M02', [direct('c', 'RED'), direct('d', 'BLUE')], 'READY'),
      fixture('final', 2, 1, 'R2-M01', [winnerOf('sf1', 'RED'), winnerOf('sf2', 'BLUE')]),
      fixture(
        'third',
        3,
        1,
        'H3-M01',
        [loserOf('sf1', 'RED'), loserOf('sf2', 'BLUE')],
        thirdStatus,
      ),
    ],
  } as unknown as ActiveBracket;
}

describe('third-place match in the bracket chart', () => {
  it('sits under the final in its column, with no connector from the semi-finals', () => {
    const { rounds, edges } = bracketChartPresentation(bracket());
    expect(rounds.map((round) => round.label)).toEqual(['Bán kết', 'Chung kết']);
    const finalRound = rounds.find((round) => round.label === 'Chung kết');
    expect(finalRound?.fixtures.map((f) => [f.id, f.position, f.displayReference])).toEqual([
      ['final', 1, 'R2-M01'],
      ['third', 2, 'Tranh hạng 3 · H3-M01'],
    ]);
    expect(edges.some((edge) => edge.targetFixtureId === 'third')).toBe(false);
    expect(edges.filter((edge) => edge.targetFixtureId === 'final')).toHaveLength(2);
  });
});

describe('FixtureList with a third-place match', () => {
  it('lists "Tranh hạng 3" before the final and waits for the semi-final losers', () => {
    render(
      <MemoryRouter>
        <FixtureList data={bracket()} disabled onDecide={vi.fn()} />
      </MemoryRouter>,
    );
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(['Bán kết', 'Tranh hạng 3', 'Chung kết']);
    const third = screen.getByText('H3-M01').closest('li') as HTMLElement;
    expect(within(third).getByText('Chờ người thua R1-M01')).toBeInTheDocument();
    expect(within(third).getByText('Chờ người thua R1-M02')).toBeInTheDocument();
  });
});

describe('ThirdPlaceMatchToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves "Thực hiện trận tranh hạng 3" as soon as it is switched on', async () => {
    api.updateThirdPlaceMatch.mockResolvedValue({
      weightClass: { id: 'w-1', thirdPlaceMatchEnabled: true },
    });
    renderWithQueryClient(
      <ThirdPlaceMatchToggle
        bracket={undefined}
        initialEnabled={false}
        isReadOnly={false}
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Thực hiện trận tranh hạng 3' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(api.updateThirdPlaceMatch).toHaveBeenCalledWith('t-1', 'w-1', true);
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('switches back when the server refuses the change', async () => {
    api.updateThirdPlaceMatch.mockRejectedValue(new Error('locked'));
    renderWithQueryClient(
      <ThirdPlaceMatchToggle
        bracket={bracket()}
        initialEnabled
        isReadOnly={false}
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Thực hiện trận tranh hạng 3' });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('is locked once the bracket is complete or the third-place match has started', () => {
    expect(thirdPlaceLockReason(undefined)).toBeNull();
    expect(thirdPlaceLockReason(bracket())).toBeNull();
    expect(thirdPlaceLockReason(bracket({ status: 'COMPLETED' }))).toMatch(/hoàn tất/);
    expect(thirdPlaceLockReason(bracket({}, 'MATCH_PREPARED'))).toMatch(/không thể tắt/);
    renderWithQueryClient(
      <ThirdPlaceMatchToggle
        bracket={bracket({ status: 'COMPLETED' })}
        initialEnabled
        isReadOnly={false}
        tournamentId="t-1"
        weightClassId="w-1"
      />,
    );
    expect(screen.getByRole('switch', { name: 'Thực hiện trận tranh hạng 3' })).toBeDisabled();
  });
});
