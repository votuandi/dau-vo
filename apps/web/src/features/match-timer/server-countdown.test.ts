import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatCountdown,
  remainingUntil,
  serverClockOffset,
  useServerCountdown,
} from './server-countdown';

describe('formatCountdown', () => {
  it.each([
    [0, '00:00'],
    [-5_000, '00:00'],
    [1, '00:01'],
    [59_001, '01:00'],
    [120_000, '02:00'],
    [605_000, '10:05'],
  ])('formats %d ms as %s', (milliseconds, expected) => {
    expect(formatCountdown(milliseconds)).toBe(expected);
  });
});

describe('serverClockOffset', () => {
  it('measures how far the server clock is ahead of the browser', () => {
    expect(serverClockOffset('2030-01-01T00:00:05.000Z', Date.parse('2030-01-01T00:00:00Z'))).toBe(
      5_000,
    );
  });

  it('falls back to zero for a missing or invalid timestamp', () => {
    expect(serverClockOffset(undefined, 1)).toBe(0);
    expect(serverClockOffset('not-a-date', 1)).toBe(0);
  });
});

describe('remainingUntil', () => {
  const now = Date.parse('2030-01-01T00:00:00Z');

  it('returns null when the deadline is unknown', () => {
    expect(remainingUntil(null, now, 0)).toBeNull();
    expect(remainingUntil(undefined, now, 0)).toBeNull();
    expect(remainingUntil('invalid', now, 0)).toBeNull();
  });

  it('applies the server offset and never goes negative', () => {
    expect(remainingUntil('2030-01-01T00:01:00Z', now, 0)).toBe(60_000);
    expect(remainingUntil('2030-01-01T00:01:00Z', now, 10_000)).toBe(50_000);
    expect(remainingUntil('2029-12-31T23:59:00Z', now, 0)).toBe(0);
  });
});

describe('useServerCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down against the server clock', () => {
    const { result } = renderHook(() =>
      useServerCountdown('2030-01-01T00:02:00Z', '2030-01-01T00:00:00Z'),
    );
    expect(result.current).toBe(120_000);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(formatCountdown(result.current ?? 0)).toBe('01:59');
  });

  it('only re-renders when the displayed second changes', () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useServerCountdown('2030-01-01T00:02:00Z', '2030-01-01T00:00:00Z');
    });
    const afterMount = renders;

    // Four polls per second, but only one render per displayed second.
    for (let second = 1; second <= 3; second += 1) {
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(renders - afterMount).toBe(second);
    }
  });

  it('returns null without a deadline', () => {
    const { result } = renderHook(() => useServerCountdown(null, undefined));
    expect(result.current).toBeNull();
  });
});
