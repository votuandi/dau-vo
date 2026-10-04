import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@martial-arts-scoring/shared-types';
import type { ActiveBracket, BracketPreview } from '@/services/api/admin-management';
import { BRACKET_LAYOUT, bracketConnectorPath, fixtureTopOffsets } from './bracket-chart-layout';
import { BracketChart } from './bracket-chart';

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

function previewBracket(): BracketPreview {
  const athlete = (id: string, name: string) => ({
    id,
    name,
    organizationName: 'CLB A',
    imageUrl: null,
  });
  return {
    previewToken: 'preview-token',
    expiresAt: '',
    summary: {
      athleteCount: 3,
      bracketSize: 4,
      byeCount: 1,
      roundCount: 2,
      totalFixtureCount: 2,
      firstRoundFixtureCount: 1,
    },
    // Deliberately not draw-position order: eligibility must use identifiers.
    initialEntrants: [
      { drawPosition: 3, athleteId: 'c', athlete: athlete('c', 'Cường'), isBye: false },
      { drawPosition: 1, athleteId: 'a', athlete: athlete('a', 'An'), isBye: false },
      { drawPosition: 4, athleteId: null, athlete: null, isBye: true },
      { drawPosition: 2, athleteId: 'b', athlete: athlete('b', 'Bình'), isBye: false },
    ],
    rounds: [
      {
        roundNumber: 1,
        label: 'Tứ kết',
        fixtures: [
          {
            id: 'r1-m1',
            displayReference: 'R1-M01',
            position: 1,
            slots: [
              { side: 'RED', source: { kind: 'ENTRANT', entrantId: 'a' }, resolvedEntrantId: 'a' },
              { side: 'BLUE', source: { kind: 'ENTRANT', entrantId: 'b' }, resolvedEntrantId: 'b' },
            ],
          },
          {
            id: 'r1-m2',
            displayReference: 'R1-M02',
            position: 2,
            slots: [
              { side: 'RED', source: { kind: 'ENTRANT', entrantId: 'c' }, resolvedEntrantId: 'c' },
              { side: 'BLUE', source: { kind: 'ENTRANT' }, resolvedEntrantId: null },
            ],
          },
        ],
      },
      {
        roundNumber: 2,
        label: 'Chung kết',
        fixtures: [
          {
            id: 'r2-m1',
            displayReference: 'R2-M01',
            position: 1,
            slots: [
              {
                side: 'RED',
                source: { kind: 'FIXTURE_WINNER', fixtureId: 'r1-m1' },
                resolvedEntrantId: null,
              },
              {
                side: 'BLUE',
                source: { kind: 'FIXTURE_WINNER', fixtureId: 'r1-m2' },
                resolvedEntrantId: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('BracketChart', () => {
  it('renders edit buttons for every preview entrant and invokes the selected athlete', () => {
    const edited: string[] = [];
    render(
      <BracketChart data={previewBracket()} onEditAthlete={(id: string) => edited.push(id)} />,
    );

    const buttons = screen.getAllByRole('button', { name: /Đổi vị trí/ });
    expect(buttons).toHaveLength(3);
    buttons[0]?.click();
    expect(edited).toEqual(['a']);
  });

  it('hides preview edit buttons while the callback is withheld for a pending mutation', () => {
    render(<BracketChart data={previewBracket()} />);

    expect(screen.queryByRole('button', { name: /Đổi vị trí/ })).not.toBeInTheDocument();
  });

  it('keeps edit buttons available after a successful swap supplies a replacement preview', () => {
    const onEditAthlete = () => undefined;
    const { rerender } = render(
      <BracketChart data={previewBracket()} onEditAthlete={onEditAthlete} />,
    );
    expect(screen.getAllByRole('button', { name: /Đổi vị trí/ })).toHaveLength(3);

    const originalPreview = previewBracket();
    const swappedPreview: BracketPreview = {
      ...originalPreview,
      initialEntrants: originalPreview.initialEntrants.map((entrant) =>
        entrant.drawPosition === 1
          ? {
              ...entrant,
              athleteId: 'b',
              athlete: { id: 'b', name: 'Bình', organizationName: 'CLB A', imageUrl: null },
            }
          : entrant.drawPosition === 2
            ? {
                ...entrant,
                athleteId: 'a',
                athlete: { id: 'a', name: 'An', organizationName: 'CLB A', imageUrl: null },
              }
            : entrant,
      ),
    };
    rerender(<BracketChart data={swappedPreview} onEditAthlete={onEditAthlete} />);

    expect(screen.getAllByRole('button', { name: /Đổi vị trí/ })).toHaveLength(3);
  });

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

  it('highlights a resolved fixture with its winner side color', () => {
    const bracket = activeBracket(MatchPhase.FINISHED, MatchLifecycle.COMPLETED);
    const fixture = bracket.fixtures[0];

    if (!fixture) {
      throw new Error('Expected the test bracket to contain a fixture');
    }
    const resolvedBracket: ActiveBracket = {
      ...bracket,
      fixtures: [{ ...fixture, winnerEntrant: { id: 'a', snapshotName: 'Nguyễn An' } }],
    };

    render(<BracketChart data={resolvedBracket} />);

    const card = document.querySelector('[data-fixture-id="fixture-1"]');
    expect(card).toHaveClass('border-red-500');
    expect(screen.getByText('Thắng: Nguyễn An')).toHaveClass('bg-red-500');
  });

  it('offers manual winner selection only for an awaiting fixture with two resolved participants', () => {
    const bracket = activeBracket(MatchPhase.FINISHED, MatchLifecycle.COMPLETED);
    const fixture = bracket.fixtures[0]!;
    const eligible: ActiveBracket = {
      ...bracket,
      fixtures: [
        {
          ...fixture,
          status: 'AWAITING_WINNER',
          slots: fixture.slots.map((slot) => ({
            ...slot,
            resolvedEntrant: slot.directEntrant,
          })),
        },
      ],
    };
    const decide = vi.fn();
    const { rerender } = render(<BracketChart data={eligible} onDecideWinner={decide} />);

    fireEvent.click(screen.getByRole('button', { name: /Chọn VĐV chiến thắng cho TK-01/ }));
    expect(decide).toHaveBeenCalledWith(eligible.fixtures[0]);

    rerender(
      <BracketChart
        data={{ ...eligible, fixtures: [{ ...eligible.fixtures[0]!, status: 'MATCH_PREPARED' }] }}
        onDecideWinner={decide}
      />,
    );
    expect(screen.queryByRole('button', { name: /Chọn VĐV chiến thắng/ })).not.toBeInTheDocument();
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
