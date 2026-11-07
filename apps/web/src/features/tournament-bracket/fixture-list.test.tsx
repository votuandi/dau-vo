import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from '@/services/api/admin-management';
import { FixtureList } from './fixture-list';

function bracket(score: { RED: number; BLUE: number } | null): ActiveBracket {
  const entrant = (id: string, name: string) => ({
    id,
    snapshotName: name,
    snapshotOrganization: null,
    snapshotImagePath: null,
    isSeed: false,
  });
  return {
    bracket: {
      id: 'bracket-1',
      status: 'COMPLETED',
      athleteCount: 2,
      bracketSize: 2,
      roundCount: 1,
      confirmedAt: '',
      championEntrant: null,
    },
    entrants: [],
    fixtures: [
      {
        id: 'fixture-1',
        displayReference: 'CK-01',
        roundNumber: 1,
        position: 1,
        status: 'COMPLETED',
        displayState: MatchDisplayState.COMPLETED,
        match: {
          id: 'match-1',
          publicId: 'M-01',
          lifecycle: MatchLifecycle.COMPLETED,
          phase: MatchPhase.FINISHED,
          status: MatchPhase.FINISHED,
          score,
        },
        winnerEntrant: { id: 'b', snapshotName: 'Lý Phúc' },
        slots: [
          {
            side: 'RED',
            sourceFixtureId: null,
            directEntrant: null,
            resolvedEntrant: entrant('a', 'Thạch Khang'),
          },
          {
            side: 'BLUE',
            sourceFixtureId: null,
            directEntrant: null,
            resolvedEntrant: entrant('b', 'Lý Phúc'),
          },
        ],
      },
    ],
  } as unknown as ActiveBracket;
}

function renderList(data: ActiveBracket) {
  return render(
    <MemoryRouter>
      <FixtureList data={data} disabled={false} onDecide={() => undefined} />
    </MemoryRouter>,
  );
}

describe('FixtureList', () => {
  it('shows "Red score vs score Blue" for a scored result', () => {
    renderList(bracket({ RED: 5, BLUE: 8 }));

    const line = screen.getByLabelText('Tỉ số 5 - 8').closest('p');
    expect(line).toHaveTextContent('Thạch Khang5vs8Lý Phúc');
  });

  it('keeps the plain "vs" line when there is no score', () => {
    renderList(bracket(null));

    expect(screen.queryByLabelText(/Tỉ số/u)).not.toBeInTheDocument();
    expect(screen.getByText('Thạch Khang').closest('p')).toHaveTextContent('Thạch KhangvsLý Phúc');
  });
});
