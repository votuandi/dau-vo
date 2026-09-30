import { describe, expect, it } from 'vitest';
import type { ActiveBracket, BracketPreview } from '@/services/api/admin-management';
import { bracketPresentation } from './bracket-graph';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';

type Side = 'RED' | 'BLUE';

function fixtureGraph(athleteCount: number) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, athleteCount)));
  const fixtures: {
    id: string;
    displayReference: string;
    round: number;
    slots: { side: Side; sourceId: string | null }[];
  }[] = [];
  let previous: string[] = [];
  for (let round = 1, count = size / 2; count >= 1; round += 1, count /= 2) {
    const ids = Array.from(
      { length: count },
      (_, index) => `r${String(round)}-${String(index + 1)}`,
    );
    ids.forEach((id, index) => {
      const sources: [string | null, string | null] =
        round === 1 ? [null, null] : [previous[index * 2] ?? null, previous[index * 2 + 1] ?? null];
      fixtures.push({
        id,
        displayReference: `T${String(round)}-${String(index + 1)}`,
        round,
        slots: [
          { side: 'RED', sourceId: sources[0] },
          { side: 'BLUE', sourceId: sources[1] },
        ],
      });
    });
    previous = ids;
  }
  return fixtures;
}

function previewFor(athleteCount: number): Pick<BracketPreview, 'rounds' | 'initialEntrants'> {
  const fixtures = fixtureGraph(athleteCount);
  return {
    initialEntrants: [],
    rounds: [...new Set(fixtures.map((fixture) => fixture.round))].map((roundNumber) => ({
      roundNumber,
      label: `R${String(roundNumber)}`,
      fixtures: fixtures
        .filter((fixture) => fixture.round === roundNumber)
        .map((fixture, index) => ({
          id: fixture.id,
          displayReference: fixture.displayReference,
          position: index + 1,
          slots: fixture.slots.map((slot) => ({
            side: slot.side,
            source: slot.sourceId
              ? { kind: 'FIXTURE_WINNER' as const, fixtureId: slot.sourceId }
              : { kind: 'ENTRANT' as const },
            resolvedEntrantId: null,
          })),
        })),
    })),
  };
}

function confirmedFor(athleteCount: number): ActiveBracket {
  const fixtures = fixtureGraph(athleteCount);
  return {
    bracket: {
      id: 'b',
      status: 'CONFIRMED',
      athleteCount,
      bracketSize: 2,
      roundCount: 1,
      confirmedAt: '',
      championEntrant: null,
    },
    entrants: [],
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      displayReference: fixture.displayReference,
      roundNumber: fixture.round,
      position: Number(fixture.id.split('-')[1]),
      status: 'PENDING_PARTICIPANTS',
      displayState: MatchDisplayState.NOT_READY,
      match: null,
      winnerEntrant: null,
      slots: fixture.slots.map((slot) => ({
        side: slot.side,
        sourceFixtureId: slot.sourceId,
        resolvedEntrant: null,
        directEntrant: null,
      })),
    })),
  };
}

describe('bracketPresentation', () => {
  it.each([2, 3, 4, 5, 8, 16, 29, 31, 32, 64])(
    'maps every valid advancement for %i athletes',
    (athleteCount) => {
      const graph = bracketPresentation(previewFor(athleteCount));
      const ids = new Set(graph.fixtures.map((fixture) => fixture.id));
      expect(graph.edges).toHaveLength(graph.fixtures.length - 1);
      expect(
        graph.edges.every((edge) => ids.has(edge.sourceFixtureId) && ids.has(edge.targetFixtureId)),
      ).toBe(true);
      expect(new Set(graph.edges.map((edge) => edge.sourceFixtureId)).size).toBe(
        graph.edges.length,
      );
    },
  );

  it('preserves RED and BLUE target slots and produces the same topology in both API shapes', () => {
    const preview = bracketPresentation(previewFor(5));
    const confirmed = bracketPresentation(confirmedFor(5));
    expect(preview.edges).toEqual(confirmed.edges);
    expect(preview.edges.filter((edge) => edge.targetFixtureId === 'r2-1')).toEqual([
      { sourceFixtureId: 'r1-1', targetFixtureId: 'r2-1', targetSide: 'RED' },
      { sourceFixtureId: 'r1-2', targetFixtureId: 'r2-1', targetSide: 'BLUE' },
    ]);
  });

  it('does not draw a connector for a missing source fixture', () => {
    const preview = previewFor(4);
    const finalFixture = preview.rounds[1]?.fixtures[0];
    if (!finalFixture) throw new Error('Expected final fixture');
    const missingSourcePreview = {
      ...preview,
      rounds: preview.rounds.map((round) =>
        round.roundNumber === 2
          ? {
              ...round,
              fixtures: round.fixtures.map((fixture) =>
                fixture.id === finalFixture.id
                  ? {
                      ...fixture,
                      slots: fixture.slots.map((slot) =>
                        slot.side === 'BLUE'
                          ? {
                              ...slot,
                              source: { kind: 'FIXTURE_WINNER' as const, fixtureId: 'gone' },
                            }
                          : slot,
                      ),
                    }
                  : fixture,
              ),
            }
          : round,
      ),
    };

    expect(bracketPresentation(missingSourcePreview).edges).toEqual([
      { sourceFixtureId: 'r1-1', targetFixtureId: 'r2-1', targetSide: 'RED' },
    ]);
  });

  it('keeps later-round source sides stable when first-round fixtures are absent', () => {
    const preview = previewFor(8);
    const missingFirstRoundFixtures = {
      ...preview,
      rounds: preview.rounds.map((round) =>
        round.roundNumber === 1
          ? {
              ...round,
              fixtures: round.fixtures.filter(
                (fixture) => !['r1-1', 'r1-3', 'r1-4'].includes(fixture.id),
              ),
            }
          : round,
      ),
    };

    expect(bracketPresentation(missingFirstRoundFixtures).edges).toEqual([
      { sourceFixtureId: 'r1-2', targetFixtureId: 'r2-1', targetSide: 'BLUE' },
      { sourceFixtureId: 'r2-1', targetFixtureId: 'r3-1', targetSide: 'RED' },
      { sourceFixtureId: 'r2-2', targetFixtureId: 'r3-1', targetSide: 'BLUE' },
    ]);
  });
});
