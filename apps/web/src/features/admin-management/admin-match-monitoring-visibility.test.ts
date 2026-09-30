import { describe, expect, it } from 'vitest';
import { MatchLifecycle } from '@/types/shared';
import { shouldMonitorLiveMatch } from './admin-match-monitoring-visibility';

describe('shouldMonitorLiveMatch', () => {
  it('stops live monitoring only after a completed match has its final result', () => {
    expect(
      shouldMonitorLiveMatch({
        lifecycle: MatchLifecycle.COMPLETED,
        hasFinalOutcome: true,
      }),
    ).toBe(false);
  });

  it.each([
    { lifecycle: MatchLifecycle.COMPLETED, hasFinalOutcome: false },
    { lifecycle: MatchLifecycle.IN_PROGRESS, hasFinalOutcome: true },
  ])('keeps monitoring when completion and final result are not both present', (match) => {
    expect(shouldMonitorLiveMatch(match)).toBe(true);
  });
});
