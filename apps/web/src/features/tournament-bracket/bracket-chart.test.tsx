import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from '@/services/api/admin-management';
import { BracketChart } from './bracket-chart';

function activeBracket(phase: MatchPhase, lifecycle: MatchLifecycle): ActiveBracket {
  return {
    bracket: {
      id: 'bracket-1',
      status: 'CONFIRMED',
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
        displayReference: 'TK-01',
        roundNumber: 1,
        position: 1,
        status: 'MATCH_PREPARED',
        displayState: MatchDisplayState.IN_PROGRESS,
        match: { id: 'match-1', publicId: 'M-01', lifecycle, phase, status: phase },
        winnerEntrant: null,
        slots: [
          {
            side: 'RED',
            sourceFixtureId: null,
            resolvedEntrant: null,
            directEntrant: {
              id: 'a',
              snapshotName: 'Nguyễn An',
              snapshotOrganization: 'CLB A',
              snapshotImagePath: null,
            },
          },
          {
            side: 'BLUE',
            sourceFixtureId: null,
            resolvedEntrant: null,
            directEntrant: {
              id: 'b',
              snapshotName: 'Trần Bình',
              snapshotOrganization: 'CLB B',
              snapshotImagePath: null,
            },
          },
        ],
      },
    ],
  };
}

describe('BracketChart', () => {
  it('keeps the display reference and standard status chips together without RED/BLUE text labels', () => {
    render(
      <BracketChart data={activeBracket(MatchPhase.ROUND_1_PAUSED, MatchLifecycle.SUSPENDED)} />,
    );

    expect(screen.getByText('TK-01')).toBeInTheDocument();
    expect(screen.getByText('Tạm hoãn')).toBeInTheDocument();
    expect(screen.getByText('Hiệp 1 tạm dừng')).toBeInTheDocument();
    expect(screen.queryByText('RED')).not.toBeInTheDocument();
    expect(screen.queryByText('BLUE')).not.toBeInTheDocument();
    expect(screen.getByText('Bên đỏ')).toHaveClass('sr-only');
    expect(screen.getByText('Bên xanh')).toHaveClass('sr-only');
  });

  it('uses lifecycle and final-phase labels from the match enum data', () => {
    render(<BracketChart data={activeBracket(MatchPhase.FINISHED, MatchLifecycle.COMPLETED)} />);

    expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
    expect(screen.getByText('Kết quả cuối cùng')).toBeInTheDocument();
  });
});
