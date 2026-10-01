import type { BracketPreview } from '@/services/api/admin-management';

type PreviewEntrant = BracketPreview['initialEntrants'][number];

/**
 * The API represents first-round pairings by durable draw positions. Do not
 * infer those pairings from array order: clients may receive the placements in
 * a different order without changing the bracket. A first-round bye is part
 * of the draw position, so its recipient may be swapped like any other
 * preview entrant.
 */
export function swappablePreviewAthleteIds(
  entrants: readonly PreviewEntrant[],
): ReadonlySet<string> {
  return new Set(
    entrants.flatMap((entrant) => (entrant.athleteId ? [entrant.athleteId] : [])),
  );
}
