import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from '@/services/api/admin-management';
import { BracketChart, fixtureTopOffsets } from './bracket-chart';

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

  it.each([
    [4, [1, 2]],
    [8, [1, 2, 4]],
    [16, [1, 4, 8]],
  ])(
    'preserves first-round tree slots when positions %j are absent in a %i-slot bracket',
    (bracketSize, missingPositions) => {
      const firstRoundSlots = bracketSize / 2;
      const offsets = fixtureTopOffsets([
        {
          roundNumber: 1,
          fixtures: Array.from({ length: firstRoundSlots }, (_, index) => index + 1)
            .filter((position) => !missingPositions.includes(position))
            .map((position) => ({ id: `r1-${String(position)}`, position })),
        },
        {
          roundNumber: 2,
          fixtures: Array.from({ length: firstRoundSlots / 2 }, (_, index) => ({
            id: `r2-${String(index + 1)}`,
            position: index + 1,
          })),
        },
      ]);

      for (let position = 1; position <= firstRoundSlots; position += 1) {
        if (missingPositions.includes(position)) continue;
        expect(offsets.get(`r1-${String(position)}`)).toBe((position - 1) * 224);
      }
      expect(offsets.get('r2-1')).toBe(112);
      if (firstRoundSlots >= 4) expect(offsets.get('r2-2')).toBe(560);
    },
  );

  it.each([2, 4, 8, 16])(
    'uses the same logical tree spacing across all rounds of a %i-slot bracket',
    (bracketSize) => {
      const roundCount = Math.log2(bracketSize);
      const offsets = fixtureTopOffsets(
        Array.from({ length: roundCount }, (_, roundIndex) => ({
          roundNumber: roundIndex + 1,
          fixtures: Array.from({ length: bracketSize / 2 ** (roundIndex + 1) }, (_, index) => ({
            id: `r${String(roundIndex + 1)}-${String(index + 1)}`,
            position: index + 1,
          })),
        })),
      );

      for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
        expect(offsets.get(`r${String(roundIndex + 1)}-1`)).toBe((2 ** roundIndex - 1) * 112);
      }
    },
  );
});
