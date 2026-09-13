import {
  generateSingleEliminationBracket,
  type GeneratedSingleEliminationBracket,
  type RandomSource,
} from './single-elimination-bracket.generator';

class SequenceRandomSource implements RandomSource {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  nextInt(maxExclusive: number): number {
    const value = this.values[this.index++] ?? 0;
    return value % maxExclusive;
  }
}

const zeroRandom: RandomSource = { nextInt: () => 0 };

describe('generateSingleEliminationBracket', () => {
  it('rejects zero athletes', () => {
    expect(() => generate([])).toThrow('At least two athletes');
  });

  it('rejects one athlete', () => {
    expect(() => generate(['athlete-1'])).toThrow('At least two athletes');
  });

  it('rejects duplicate athlete IDs', () => {
    expect(() => generate(['a', 'a'])).toThrow('Athlete IDs must be unique');
  });

  it.each([
    [2, 2, 0, 1, 1],
    [3, 4, 1, 2, 2],
    [4, 4, 0, 2, 3],
    [5, 8, 3, 3, 4],
    [29, 32, 3, 5, 28],
    [31, 32, 1, 5, 30],
    [32, 32, 0, 5, 31],
    [33, 64, 31, 6, 32],
    [63, 64, 1, 6, 62],
    [64, 64, 0, 6, 63],
  ])(
    'constructs correct bracket calculations for %i athletes',
    (athleteCount, bracketSize, byeCount, roundCount, totalFixtureCount) => {
      const bracket = generate(athletes(athleteCount));

      expect(bracket.bracketSize).toBe(bracketSize);
      expect(bracket.byeCount).toBe(byeCount);
      expect(bracket.roundCount).toBe(roundCount);
      expect(bracket.totalFixtureCount).toBe(totalFixtureCount);
      expect(bracket.fixtures).toHaveLength(totalFixtureCount);
      expect(
        bracket.fixtures.filter((fixture) => fixture.downstream === null),
      ).toHaveLength(1);
      expect(bracket.rounds.at(-1)?.label).toBe('Chung kết');
    },
  );

  it.each([
    [2, 1],
    [3, 1],
    [4, 2],
    [5, 1],
    [29, 13],
    [31, 15],
    [32, 16],
    [33, 1],
    [63, 31],
    [64, 32],
  ])(
    'has %i athletes and %i actual first-round fixtures',
    (athleteCount, fixtureCount) => {
      const bracket = generate(athletes(athleteCount));
      expect(bracket.firstRoundMatchCount).toBe(fixtureCount);
      expect(bracket.rounds[0]?.fixtures).toHaveLength(fixtureCount);
    },
  );

  it('uses final-relative Vietnamese labels', () => {
    const labels = generate(athletes(64)).rounds.map((round) => round.label);
    expect(labels).toEqual([
      'Vòng 1',
      'Vòng 2',
      'Vòng 3',
      'Tứ kết',
      'Bán kết',
      'Chung kết',
    ]);
  });

  it('places every athlete once initially and creates no double-bye branch', () => {
    const bracket = generate(athletes(29));
    const initialAthletes = bracket.initialEntrants.flatMap((placement) =>
      placement.athleteId === null ? [] : [placement.athleteId],
    );

    expect(initialAthletes.sort()).toEqual(athletes(29).sort());
    expect(
      bracket.initialEntrants.filter(
        (placement) => placement.athleteId === null,
      ),
    ).toHaveLength(3);
    expect(
      firstRoundPairs(bracket).every(
        ([red, blue]) => red !== null || blue !== null,
      ),
    ).toBe(true);
  });

  it('assigns stable RED and BLUE slots and prescribed downstream sides', () => {
    const bracket = generate(athletes(32));
    const downstreamSources = new Set<string>();

    for (const fixture of bracket.fixtures) {
      expect(fixture.slots.map((slot) => slot.side)).toEqual(['RED', 'BLUE']);
      if (fixture.downstream !== null) {
        expect(['RED', 'BLUE']).toContain(fixture.downstream.side);
      }
      for (const slot of fixture.slots) {
        if (slot.source.kind === 'FIXTURE_WINNER') {
          const sourceFixtureId = slot.source.fixtureId;
          expect(downstreamSources.has(sourceFixtureId)).toBe(false);
          downstreamSources.add(sourceFixtureId);
          expect(
            bracket.fixtures.find((fixture) => fixture.id === sourceFixtureId)
              ?.downstream,
          ).toEqual({
            fixtureId: fixture.id,
            side: slot.side,
          });
        }
      }
    }

    expect(downstreamSources.size).toBe(bracket.totalFixtureCount - 1);
  });

  it('uses controlled random sources and supports deterministic redraws', () => {
    const athleteIds = athletes(5);
    const first = generate(
      athleteIds,
      new SequenceRandomSource([0, 0, 0, 0, 0, 0, 0]),
    );
    const repeat = generate(
      athleteIds,
      new SequenceRandomSource([0, 0, 0, 0, 0, 0, 0]),
    );
    const redraw = generate(
      athleteIds,
      new SequenceRandomSource([1, 1, 1, 1, 1, 1, 1]),
    );

    expect(repeat).toEqual(first);
    expect(redraw.initialEntrants).not.toEqual(first.initialEntrants);
  });

  it('does not mutate the input athlete array', () => {
    const athleteIds = athletes(5);
    const original = [...athleteIds];
    generate(athleteIds);
    expect(athleteIds).toEqual(original);
  });

  it('honors the caller-configured athlete maximum', () => {
    expect(() =>
      generateSingleEliminationBracket({
        athleteIds: athletes(65),
        maxAthletes: 64,
        randomSource: zeroRandom,
      }),
    ).toThrow('Bracket cannot contain more than 64 athletes.');
    expect(
      generateSingleEliminationBracket({
        athleteIds: athletes(64),
        maxAthletes: 64,
        randomSource: zeroRandom,
      }).athleteCount,
    ).toBe(64);
  });
});

function generate(
  athleteIds: readonly string[],
  randomSource: RandomSource = zeroRandom,
): GeneratedSingleEliminationBracket {
  return generateSingleEliminationBracket({ athleteIds, randomSource });
}

function athletes(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `athlete-${index + 1}`);
}

function firstRoundPairs(
  bracket: GeneratedSingleEliminationBracket,
): Array<[string | null, string | null]> {
  const placements = bracket.initialEntrants;
  return Array.from({ length: placements.length / 2 }, (_, index) => [
    placements[index * 2]?.athleteId ?? null,
    placements[index * 2 + 1]?.athleteId ?? null,
  ]);
}
