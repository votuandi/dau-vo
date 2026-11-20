import { describe, expect, it } from 'vitest';
import { MatchLifecycle } from '@/types/shared';
import type { WatchMatch } from '@/services/api/watch';
import { groupWatchMatches, watchMatchGroup } from './match-order';

function match(
  publicId: string,
  lifecycle: MatchLifecycle,
  times: Partial<Pick<WatchMatch, 'createdAt' | 'startedAt' | 'finishedAt'>> = {},
): WatchMatch {
  return {
    publicId,
    lifecycle,
    createdAt: '2026-11-20T08:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...times,
  } as WatchMatch;
}

describe('watchMatchGroup', () => {
  it.each([
    [MatchLifecycle.IN_PROGRESS, 'live'],
    [MatchLifecycle.SUSPENDED, 'live'],
    [MatchLifecycle.COMPLETED, 'finished'],
    [MatchLifecycle.READY, 'upcoming'],
  ] as const)('%s → %s', (lifecycle, group) => {
    expect(watchMatchGroup({ lifecycle })).toBe(group);
  });
});

describe('groupWatchMatches', () => {
  it('orders live, then finished, then upcoming matches', () => {
    const groups = groupWatchMatches([
      match('UP2', MatchLifecycle.READY, { createdAt: '2026-11-20T09:00:00.000Z' }),
      match('DONE1', MatchLifecycle.COMPLETED, { finishedAt: '2026-11-20T08:10:00.000Z' }),
      match('LIVE2', MatchLifecycle.IN_PROGRESS, { startedAt: '2026-11-20T08:30:00.000Z' }),
      match('UP1', MatchLifecycle.READY, { createdAt: '2026-11-20T08:00:00.000Z' }),
      match('DONE2', MatchLifecycle.COMPLETED, { finishedAt: '2026-11-20T08:20:00.000Z' }),
      match('LIVE1', MatchLifecycle.IN_PROGRESS, { startedAt: '2026-11-20T08:25:00.000Z' }),
    ]);
    expect(groups.map((entry) => [entry.group, entry.matches.map((m) => m.publicId)])).toEqual([
      ['live', ['LIVE1', 'LIVE2']],
      ['finished', ['DONE2', 'DONE1']],
      ['upcoming', ['UP1', 'UP2']],
    ]);
  });

  it('omits empty groups', () => {
    expect(groupWatchMatches([match('UP', MatchLifecycle.READY)]).map((g) => g.group)).toEqual([
      'upcoming',
    ]);
  });
});
