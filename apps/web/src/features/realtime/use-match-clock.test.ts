import { describe, expect, it } from 'vitest';
import { calculateRemainingMs, formatClock } from './use-match-clock';

describe('visual match clock', () => {
  it('uses the authoritative end timestamp and never goes negative', () => {
    expect(calculateRemainingMs('2026-08-28T10:00:01.000Z', Date.parse('2026-08-28T10:00:00.001Z'))).toBe(999);
    expect(calculateRemainingMs('2026-08-28T10:00:01.000Z', Date.parse('2026-08-28T10:00:01.001Z'))).toBe(0);
  });

  it('renders a ceiling-based competition countdown', () => {
    expect(formatClock(120_000)).toBe('02:00');
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(null)).toBe('--:--');
  });
});
