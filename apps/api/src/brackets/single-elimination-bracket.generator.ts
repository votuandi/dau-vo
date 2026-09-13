import { randomInt } from 'node:crypto';
import { bracketRoundLabel } from '@martial-arts-scoring/shared-types';
import { summarizeBracket } from './bracket-summary';

export type BracketSide = 'RED' | 'BLUE';

export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export const cryptoRandomSource: RandomSource = {
  nextInt(maxExclusive: number): number {
    return randomInt(maxExclusive);
  },
};

export interface GenerateBracketInput {
  athleteIds: readonly string[];
  /** Athletes that must receive a first-round bye when byes are available. */
  designatedByeAthleteIds?: readonly string[];
  randomSource: RandomSource;
  /** A caller-controlled operational limit; omitted means no additional cap. */
  maxAthletes?: number;
}

export interface BracketEntrantPlacement {
  drawPosition: number;
  athleteId: string | null;
}

export interface EntrantSlotSource {
  kind: 'ENTRANT';
  entrantId: string;
}

export interface FixtureWinnerSlotSource {
  kind: 'FIXTURE_WINNER';
  fixtureId: string;
}

export type BracketSlotSource = EntrantSlotSource | FixtureWinnerSlotSource;

export interface GeneratedBracketSlot {
  side: BracketSide;
  source: BracketSlotSource;
  /** Set when this slot is immediately resolved to an entrant (including byes). */
  resolvedEntrantId: string | null;
}

export interface GeneratedBracketFixture {
  id: string;
  roundNumber: number;
  position: number;
  displayReference: string;
  slots: readonly [GeneratedBracketSlot, GeneratedBracketSlot];
  downstream: {
    fixtureId: string;
    side: BracketSide;
  } | null;
}

export interface GeneratedBracketRound {
  roundNumber: number;
  label: string;
  fixtures: readonly GeneratedBracketFixture[];
}

export interface GeneratedSingleEliminationBracket {
  athleteCount: number;
  bracketSize: number;
  byeCount: number;
  roundCount: number;
  firstRoundMatchCount: number;
  totalFixtureCount: number;
  initialEntrants: readonly BracketEntrantPlacement[];
  rounds: readonly GeneratedBracketRound[];
  fixtures: readonly GeneratedBracketFixture[];
}

interface EntrantAdvancement {
  kind: 'ENTRANT';
  entrantId: string;
}

interface FixtureAdvancement {
  kind: 'FIXTURE_WINNER';
  fixtureId: string;
}

type Advancement = EntrantAdvancement | FixtureAdvancement;

interface MutableFixture extends GeneratedBracketFixture {
  downstream: GeneratedBracketFixture['downstream'];
}

export function generateSingleEliminationBracket(
  input: GenerateBracketInput,
): GeneratedSingleEliminationBracket {
  assertValidAthletes(input.athleteIds, input.maxAthletes);

  const summary = summarizeBracket(input.athleteIds.length);
  const { bracketSize, byeCount } = summary;
  const designatedByeAthleteIds = input.designatedByeAthleteIds ?? [];
  assertValidDesignatedByes(
    input.athleteIds,
    designatedByeAthleteIds,
    byeCount,
  );
  const designated = new Set(designatedByeAthleteIds);
  const remainingAthletes = input.athleteIds.filter(
    (id) => !designated.has(id),
  );
  // Select the unconstrained recipients independently and uniformly, then
  // randomize both recipient positions and the remaining pairings.
  const additionalByeRecipients = fisherYatesShuffle(
    remainingAthletes,
    input.randomSource,
  ).slice(0, byeCount - designatedByeAthleteIds.length);
  const byeRecipients = fisherYatesShuffle(
    [...designatedByeAthleteIds, ...additionalByeRecipients],
    input.randomSource,
  );
  const byeRecipientIds = new Set(byeRecipients);
  const contestEntrants = fisherYatesShuffle(
    input.athleteIds.filter((id) => !byeRecipientIds.has(id)),
    input.randomSource,
  );
  const byePairPositions = chooseByePairPositions(
    bracketSize / 2,
    byeCount,
    input.randomSource,
  );
  const initialEntrants = createInitialEntrants(
    bracketSize,
    byePairPositions,
    byeRecipients,
    contestEntrants,
  );

  return buildSingleEliminationBracket(initialEntrants);
}

function assertValidDesignatedByes(
  athleteIds: readonly string[],
  designatedByeAthleteIds: readonly string[],
  byeCount: number,
): void {
  if (new Set(designatedByeAthleteIds).size !== designatedByeAthleteIds.length)
    throw new Error('Designated bye athlete IDs must be unique.');
  if (designatedByeAthleteIds.some((id) => !athleteIds.includes(id)))
    throw new Error('Designated bye athletes must be in the bracket.');
  if (designatedByeAthleteIds.length > byeCount)
    throw new Error('Too many designated bye athletes.');
}

/** Builds the durable graph from a previously authenticated preview draw. */
export function buildSingleEliminationBracket(
  initialEntrants: readonly BracketEntrantPlacement[],
): GeneratedSingleEliminationBracket {
  const athleteIds = initialEntrants.flatMap((placement) =>
    placement.athleteId === null ? [] : [placement.athleteId],
  );
  if (
    initialEntrants.length < 2 ||
    initialEntrants.length & (initialEntrants.length - 1) ||
    athleteIds.length < 2 ||
    new Set(athleteIds).size !== athleteIds.length ||
    initialEntrants.some(
      (placement, index) => placement.drawPosition !== index + 1,
    )
  ) {
    throw new Error('Bracket placements are invalid.');
  }

  const athleteCount = athleteIds.length;
  const bracketSize = initialEntrants.length;
  const summary = summarizeBracket(athleteCount);
  if (summary.bracketSize !== bracketSize)
    throw new Error('Bracket placements have an invalid size.');
  const { byeCount, roundCount, totalFixtureCount } = summary;
  const firstRoundMatchCount = summary.firstRoundFixtureCount;
  const fixtures: MutableFixture[] = [];
  const fixturesByRound = new Map<number, MutableFixture[]>();
  let advancements = initialEntrants.map(toAdvancement);

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    const nextAdvancements: Advancement[] = [];
    for (let index = 0; index < advancements.length; index += 2) {
      const red = advancements[index];
      const blue = advancements[index + 1];
      if (red === undefined || blue === undefined) {
        throw new Error('Bracket capacity must produce complete pairs.');
      }

      if (red === null || blue === null) {
        const advancingEntrant = red ?? blue;
        if (advancingEntrant === null) {
          throw new Error('A double-bye branch cannot be generated.');
        }
        nextAdvancements.push(advancingEntrant);
        continue;
      }

      // Adjacent nodes form a logical match. Keeping its tree position (rather
      // than compacting omitted bye branches) fixes the later RED/BLUE parent slot.
      const position = index / 2 + 1;
      const fixture = createFixture(roundNumber, position, red, blue);
      fixtures.push(fixture);
      addFixtureToRound(fixturesByRound, fixture);
      nextAdvancements.push({ kind: 'FIXTURE_WINNER', fixtureId: fixture.id });
    }
    advancements = nextAdvancements;
  }

  linkDownstreamFixtures(fixtures);
  const rounds = createRounds(roundCount, fixturesByRound);
  return {
    athleteCount,
    bracketSize,
    byeCount,
    roundCount,
    firstRoundMatchCount,
    totalFixtureCount,
    initialEntrants: [...initialEntrants],
    rounds,
    fixtures,
  };
}

function assertValidAthletes(
  athleteIds: readonly string[],
  maxAthletes?: number,
): void {
  if (athleteIds.length < 2) {
    throw new Error(
      'At least two athletes are required to generate a bracket.',
    );
  }
  if (new Set(athleteIds).size !== athleteIds.length) {
    throw new Error('Athlete IDs must be unique.');
  }
  if (
    maxAthletes !== undefined &&
    (!Number.isSafeInteger(maxAthletes) || maxAthletes < 2)
  ) {
    throw new Error(
      'Maximum athlete count must be an integer of at least two.',
    );
  }
  if (maxAthletes !== undefined && athleteIds.length > maxAthletes) {
    throw new Error(
      `Bracket cannot contain more than ${maxAthletes} athletes.`,
    );
  }
}

function fisherYatesShuffle<T>(
  items: readonly T[],
  randomSource: RandomSource,
): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = nextRandomIndex(randomSource, index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

function nextRandomIndex(
  randomSource: RandomSource,
  maxExclusive: number,
): number {
  const value = randomSource.nextInt(maxExclusive);
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new RangeError(`Random source returned invalid index ${value}.`);
  }
  return value;
}

function chooseByePairPositions(
  pairCount: number,
  byeCount: number,
  randomSource: RandomSource,
): ReadonlySet<number> {
  return new Set(
    fisherYatesShuffle(
      Array.from({ length: pairCount }, (_, index) => index),
      randomSource,
    ).slice(0, byeCount),
  );
}

function createInitialEntrants(
  bracketSize: number,
  byePairPositions: ReadonlySet<number>,
  byeRecipients: readonly string[],
  contestEntrants: readonly string[],
): BracketEntrantPlacement[] {
  const placements: BracketEntrantPlacement[] = [];
  let byeIndex = 0;
  let contestIndex = 0;
  for (let pairIndex = 0; pairIndex < bracketSize / 2; pairIndex += 1) {
    if (byePairPositions.has(pairIndex)) {
      placements.push({
        drawPosition: pairIndex * 2 + 1,
        athleteId: byeRecipients[byeIndex++]!,
      });
      placements.push({ drawPosition: pairIndex * 2 + 2, athleteId: null });
    } else {
      placements.push({
        drawPosition: pairIndex * 2 + 1,
        athleteId: contestEntrants[contestIndex++]!,
      });
      placements.push({
        drawPosition: pairIndex * 2 + 2,
        athleteId: contestEntrants[contestIndex++]!,
      });
    }
  }
  return placements;
}

function toAdvancement(placement: BracketEntrantPlacement): Advancement | null {
  return placement.athleteId === null
    ? null
    : { kind: 'ENTRANT', entrantId: placement.athleteId };
}

function createFixture(
  roundNumber: number,
  position: number,
  red: Advancement,
  blue: Advancement,
): MutableFixture {
  const id = `r${roundNumber}-m${position}`;
  return {
    id,
    roundNumber,
    position,
    displayReference: `R${roundNumber}-M${String(position).padStart(2, '0')}`,
    slots: [createSlot('RED', red), createSlot('BLUE', blue)],
    downstream: null,
  };
}

function createSlot(
  side: BracketSide,
  advancement: Advancement,
): GeneratedBracketSlot {
  return advancement.kind === 'ENTRANT'
    ? {
        side,
        source: { kind: 'ENTRANT', entrantId: advancement.entrantId },
        resolvedEntrantId: advancement.entrantId,
      }
    : {
        side,
        source: { kind: 'FIXTURE_WINNER', fixtureId: advancement.fixtureId },
        resolvedEntrantId: null,
      };
}

function addFixtureToRound(
  fixturesByRound: Map<number, MutableFixture[]>,
  fixture: MutableFixture,
): void {
  const round = fixturesByRound.get(fixture.roundNumber) ?? [];
  round.push(fixture);
  fixturesByRound.set(fixture.roundNumber, round);
}

function linkDownstreamFixtures(fixtures: MutableFixture[]): void {
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  for (const fixture of fixtures) {
    for (const slot of fixture.slots) {
      if (slot.source.kind === 'FIXTURE_WINNER') {
        const upstream = byId.get(slot.source.fixtureId);
        if (upstream === undefined)
          throw new Error('Fixture source must exist.');
        upstream.downstream = { fixtureId: fixture.id, side: slot.side };
      }
    }
  }
}

function createRounds(
  roundCount: number,
  fixturesByRound: Map<number, MutableFixture[]>,
): GeneratedBracketRound[] {
  return Array.from({ length: roundCount }, (_, index) => {
    const roundNumber = index + 1;
    return {
      roundNumber,
      label: bracketRoundLabel(roundNumber, roundCount),
      fixtures: fixturesByRound.get(roundNumber) ?? [],
    };
  });
}
