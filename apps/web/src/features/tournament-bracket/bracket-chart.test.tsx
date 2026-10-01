import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from '@/services/api/admin-management';
import {
  BRACKET_LAYOUT,
  BracketChart,
  bracketConnectorPath,
  fixtureTopOffsets,
} from './bracket-chart';

function activeBracket(
  phase: MatchPhase,
  lifecycle: MatchLifecycle,
  firstAthleteIsSeed: boolean | null = true,
): ActiveBracket {
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
              isSeed: firstAthleteIsSeed,
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
              isSeed: false,
            },
          },
        ],
      },
    ],
  };
}

describe('BracketChart', () => {
  it('keeps the reference, status chips, side labels, participant names, and organizations visible', () => {
    render(
      <BracketChart data={activeBracket(MatchPhase.ROUND_1_PAUSED, MatchLifecycle.SUSPENDED)} />,
    );

    expect(screen.getByText('TK-01')).toBeInTheDocument();
    expect(screen.getByText('Tạm hoãn')).toBeInTheDocument();
    expect(screen.getByText('Hiệp 1 tạm dừng')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('CLB A')).toBeInTheDocument();
    expect(screen.getByText('Trần Bình')).toBeInTheDocument();
    expect(screen.getByText('CLB B')).toBeInTheDocument();
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

  it('marks only seeded athletes with an accessible label', () => {
    render(<BracketChart data={activeBracket(MatchPhase.WAITING, MatchLifecycle.NOT_STARTED)} />);

    expect(screen.getByLabelText('VĐV hạt giống')).toBeInTheDocument();
    expect(screen.getAllByTitle('VĐV hạt giống')).toHaveLength(1);
  });

  it('does not mark athletes whose seed metadata is null', () => {
    render(
      <BracketChart data={activeBracket(MatchPhase.WAITING, MatchLifecycle.NOT_STARTED, null)} />,
    );

    expect(screen.queryByLabelText('VĐV hạt giống')).not.toBeInTheDocument();
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
        expect(offsets.get(`r1-${String(position)}`)).toBe(
          (position - 1) * BRACKET_LAYOUT.rowPitch,
        );
      }
      expect(offsets.get('r2-1')).toBe(BRACKET_LAYOUT.rowPitch / 2);
      if (firstRoundSlots >= 4) expect(offsets.get('r2-2')).toBe(BRACKET_LAYOUT.rowPitch * 2.5);
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
        expect(offsets.get(`r${String(roundIndex + 1)}-1`)).toBe(
          (2 ** roundIndex - 1) * (BRACKET_LAYOUT.rowPitch / 2),
        );
      }
    },
  );

  it('uses distinct connector lanes for RED and BLUE target ports', () => {
    const sharedBounds = {
      sourceRight: 240,
      sourceCenterY: 88,
      targetLeft: 296,
      targetCenterY: 132,
    };

    expect(bracketConnectorPath({ ...sharedBounds, targetSide: 'RED' })).toBe(
      'M 240 88 H 261.28 V 132 H 296',
    );
    expect(bracketConnectorPath({ ...sharedBounds, targetSide: 'BLUE' })).toBe(
      'M 240 88 H 274.72 V 132 H 296',
    );
  });
});
