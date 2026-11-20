import { MatchLifecycle } from '@/types/shared';
import type { WatchMatch } from '@/services/api/watch';

/** Spectator-facing grouping, in the order the list shows it. */
export type WatchMatchGroup = 'live' | 'finished' | 'upcoming';

export const WATCH_MATCH_GROUPS: readonly WatchMatchGroup[] = ['live', 'finished', 'upcoming'];

export const WATCH_MATCH_GROUP_LABEL: Record<WatchMatchGroup, string> = {
  live: 'Đang diễn ra',
  finished: 'Đã diễn ra',
  upcoming: 'Chưa diễn ra',
};

/**
 * A suspended match has started and is not finished yet, so it stays with the
 * live ones: spectators can still open its scoreboard.
 */
export function watchMatchGroup(match: Pick<WatchMatch, 'lifecycle'>): WatchMatchGroup {
  switch (match.lifecycle) {
    case MatchLifecycle.IN_PROGRESS:
    case MatchLifecycle.SUSPENDED:
      return 'live';
    case MatchLifecycle.COMPLETED:
      return 'finished';
    default:
      return 'upcoming';
  }
}

const time = (value: string | null): number => (value ? Date.parse(value) : 0);

/** Live first (earliest started on top), then finished (latest first), then upcoming (scheduled order). */
function compareWithinGroup(group: WatchMatchGroup, a: WatchMatch, b: WatchMatch): number {
  if (group === 'live') return time(a.startedAt) - time(b.startedAt);
  if (group === 'finished') return time(b.finishedAt) - time(a.finishedAt);
  return time(a.createdAt) - time(b.createdAt);
}

export function groupWatchMatches(
  matches: readonly WatchMatch[],
): readonly { readonly group: WatchMatchGroup; readonly matches: readonly WatchMatch[] }[] {
  return WATCH_MATCH_GROUPS.map((group) => ({
    group,
    matches: matches
      .filter((match) => watchMatchGroup(match) === group)
      .sort(
        (a, b) => compareWithinGroup(group, a, b) || a.publicId.localeCompare(b.publicId, 'en'),
      ),
  })).filter((entry) => entry.matches.length > 0);
}
