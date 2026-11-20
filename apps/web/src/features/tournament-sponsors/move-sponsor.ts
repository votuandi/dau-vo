import type { TournamentSponsor } from '@/services/api/admin-management';

/**
 * Mirrors the server's reorder rule for an optimistic update: the moved sponsor takes
 * `target`; if another sponsor holds it, only those between the old and new position
 * shift by one (up → they move down, down → they move up).
 */
export function moveSponsor(
  items: readonly TournamentSponsor[],
  id: string,
  target: number,
): TournamentSponsor[] {
  const moved = items.find((item) => item.id === id);
  if (!moved || moved.displayIndex === target) return [...items];
  const from = moved.displayIndex;
  const taken = items.some((item) => item.id !== id && item.displayIndex === target);
  return items
    .map((item) => {
      if (item.id === id) return { ...item, displayIndex: target };
      if (!taken) return item;
      if (target < from && item.displayIndex >= target && item.displayIndex < from)
        return { ...item, displayIndex: item.displayIndex + 1 };
      if (target > from && item.displayIndex > from && item.displayIndex <= target)
        return { ...item, displayIndex: item.displayIndex - 1 };
      return item;
    })
    .sort((a, b) => a.displayIndex - b.displayIndex);
}
