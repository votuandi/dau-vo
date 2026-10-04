import type {
  ActiveBracket,
  BracketFixture,
  BracketPreview,
} from '@/services/api/admin-management';
import { bracketRoundLabel } from '@martial-arts-scoring/shared-types';
import { bracketPresentation, isBracketPreview, type BracketEdge } from './bracket-graph';

type ChartData = Pick<BracketPreview, 'rounds' | 'initialEntrants'> | ActiveBracket;
type Fixture = BracketFixture | ActiveBracket['fixtures'][number];

/** Bye cards are presentation nodes, never competitive fixtures or matches. */
export function bracketChartPresentation(data: ChartData) {
  const preview = isBracketPreview(data);
  const rounds = preview
    ? data.rounds.map((round) => ({ ...round, fixtures: [...round.fixtures] as Fixture[] }))
    : Array.from({ length: data.bracket.roundCount }, (_, index) => ({
        roundNumber: index + 1,
        label: bracketRoundLabel(index + 1, data.bracket.roundCount),
        fixtures: data.fixtures.filter((fixture) => fixture.roundNumber === index + 1),
      }));
  const byeIds = new Set<string>();
  const edges: BracketEdge[] = [...bracketPresentation(data).edges];
  for (const round of rounds) {
    for (const fixture of [...round.fixtures]) {
      const occupiedSlots = fixture.slots.filter((slot) =>
        'source' in slot
          ? slot.source.kind === 'FIXTURE_WINNER' || Boolean(slot.resolvedEntrantId)
          : Boolean(slot.sourceFixtureId) ||
            Boolean(slot.directEntrant) ||
            Boolean(slot.resolvedEntrant),
      );
      if (occupiedSlots.length === 1) {
        byeIds.add(fixture.id);
        round.fixtures[round.fixtures.indexOf(fixture)] = {
          ...fixture,
          slots: occupiedSlots,
        } as Fixture;
      }
      if (round.roundNumber <= 1) continue;
      for (const slot of fixture.slots) {
        const direct =
          'source' in slot
            ? slot.source.kind === 'ENTRANT' && Boolean(slot.resolvedEntrantId)
            : !slot.sourceFixtureId && Boolean(slot.directEntrant);
        if (!direct) continue;
        let targetId = fixture.id;
        let targetSide = slot.side;
        let position = fixture.position * 2 - (slot.side === 'RED' ? 1 : 0);
        for (let roundNumber = round.roundNumber - 1; roundNumber >= 1; roundNumber -= 1) {
          const previousRound = rounds.find((item) => item.roundNumber === roundNumber);
          if (!previousRound || previousRound.fixtures.some((item) => item.position === position))
            break;
          const id = `bye-r${String(roundNumber)}-p${String(position)}`;
          const byeSlot = { ...slot, side: 'RED' as const };
          const node: Fixture =
            'source' in byeSlot
              ? { id, position, displayReference: '', slots: [byeSlot] }
              : {
                  ...(fixture as ActiveBracket['fixtures'][number]),
                  id,
                  position,
                  roundNumber,
                  displayReference: '',
                  slots: [byeSlot],
                  match: null,
                  winnerEntrant: null,
                  winnerDecision: null,
                  status: 'BYE',
                };
          previousRound.fixtures.push(node);
          byeIds.add(id);
          edges.push({ sourceFixtureId: id, targetFixtureId: targetId, targetSide });
          targetId = id;
          targetSide = 'RED';
          position = position * 2 - 1;
        }
      }
    }
    round.fixtures.sort((a, b) => a.position - b.position);
  }
  return { rounds, byeIds, edges };
}
