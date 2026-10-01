import type { BracketPreview } from '@/services/api/admin-management';

type PreviewEntrant = BracketPreview['initialEntrants'][number];

/**
 * The API represents first-round pairings by durable draw positions. Do not
 * infer those pairings from array order: clients may receive the placements in
 * a different order without changing the bracket.
 */
export function swappablePreviewAthleteIds(
  entrants: readonly PreviewEntrant[],
): ReadonlySet<string> {
  const byDrawPosition = new Map(entrants.map((entrant) => [entrant.drawPosition, entrant]));
  return new Set(
    entrants.flatMap((entrant) => {
      if (!entrant.athleteId) return [];
      const pairedPosition =
        entrant.drawPosition % 2 === 0 ? entrant.drawPosition - 1 : entrant.drawPosition + 1;
      return byDrawPosition.get(pairedPosition)?.athleteId ? [entrant.athleteId] : [];
    }),
  );
}
