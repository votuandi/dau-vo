import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AthleteColor, type PublicMatchStatePayload } from '@martial-arts-scoring/shared-types';
import { JUDGE_VOTE_FLASH_MS } from './scoreboard-view-model';
import { useAwardedFlash } from './use-awarded-flash';

const RESOLVED_AT = '2030-01-01T00:00:00.000Z';

function judgeVotes(
  winningColor: AthleteColor | null,
  resolvedAt = RESOLVED_AT,
): PublicMatchStatePayload['judgeVotes'] {
  return { judgeCount: 3, lastResolvedWindow: { resolvedAt, winningColor, votes: [] } };
}

describe('useAwardedFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(RESOLVED_AT));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('highlights the awarded athlete for 1.5 s of server time', () => {
    const { result } = renderHook(() =>
      useAwardedFlash(judgeVotes(AthleteColor.BLUE), RESOLVED_AT, false),
    );
    expect(result.current).toEqual({ color: AthleteColor.BLUE, key: RESOLVED_AT });

    act(() => {
      vi.advanceTimersByTime(JUDGE_VOTE_FLASH_MS - 100);
    });
    expect(result.current.color).toBe(AthleteColor.BLUE);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toEqual({ color: null, key: null });
  });

  it('ends at once when the supervisor opens the next scoring stop', () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useAwardedFlash(judgeVotes(AthleteColor.RED), RESOLVED_AT, open),
      { initialProps: { open: false } },
    );
    expect(result.current.color).toBe(AthleteColor.RED);
    rerender({ open: true });
    expect(result.current).toEqual({ color: null, key: null });
  });

  it('does not highlight a call without a majority or before any call', () => {
    expect(
      renderHook(() => useAwardedFlash(judgeVotes(null), RESOLVED_AT, false)).result.current,
    ).toEqual({ color: null, key: null });
    expect(
      renderHook(() =>
        useAwardedFlash({ judgeCount: 3, lastResolvedWindow: null }, RESOLVED_AT, false),
      ).result.current,
    ).toEqual({ color: null, key: null });
  });

  it('uses a new key for each call so the highlight restarts for the same athlete', () => {
    const later = '2030-01-01T00:00:01.000Z';
    const { result, rerender } = renderHook(
      ({ votes }: { votes: PublicMatchStatePayload['judgeVotes'] }) =>
        useAwardedFlash(votes, RESOLVED_AT, false),
      { initialProps: { votes: judgeVotes(AthleteColor.RED) } },
    );
    expect(result.current.key).toBe(RESOLVED_AT);
    rerender({ votes: judgeVotes(AthleteColor.RED, later) });
    expect(result.current).toEqual({ color: AthleteColor.RED, key: later });
  });
});
