import type { ActiveBracket, BracketPreview } from '@/services/api/admin-management';

export interface BracketEdge {
  readonly sourceFixtureId: string;
  readonly targetFixtureId: string;
  readonly targetSide: 'RED' | 'BLUE';
}

export interface BracketPresentation {
  readonly fixtures: readonly { readonly id: string }[];
  readonly edges: readonly BracketEdge[];
}

type ChartData = Pick<BracketPreview, 'rounds' | 'initialEntrants'> | ActiveBracket;

export function isBracketPreview(
  data: ChartData,
): data is Pick<BracketPreview, 'rounds' | 'initialEntrants'> {
  return 'rounds' in data;
}

/** Converts either bracket API response into the relationships the chart renders. */
export function bracketPresentation(data: ChartData): BracketPresentation {
  if (isBracketPreview(data)) {
    const fixtures = data.rounds.flatMap((round) => round.fixtures);
    return {
      fixtures,
      edges: fixtures.flatMap((fixture) =>
        fixture.slots.flatMap((slot) =>
          slot.source.kind === 'FIXTURE_WINNER' && slot.source.fixtureId
            ? [
                {
                  sourceFixtureId: slot.source.fixtureId,
                  targetFixtureId: fixture.id,
                  targetSide: slot.side,
                },
              ]
            : [],
        ),
      ),
    };
  }

  return {
    fixtures: data.fixtures,
    edges: data.fixtures.flatMap((fixture) =>
      fixture.slots.flatMap((slot) =>
        slot.sourceFixtureId
          ? [
              {
                sourceFixtureId: slot.sourceFixtureId,
                targetFixtureId: fixture.id,
                targetSide: slot.side,
              },
            ]
          : [],
      ),
    ),
  };
}
