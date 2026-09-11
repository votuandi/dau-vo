export interface RoundTiming {
  durationMs: number | null;
  endsAt: Date;
}

/**
 * Calculates elapsed competition time from a round's fixed duration and its
 * current deadline. Resuming moves the deadline forward by paused wall time,
 * so the difference excludes every completed pause interval.
 */
export function activeRoundElapsedMs(
  round: RoundTiming,
  occurredAt: Date,
): number | null {
  if (round.durationMs === null) {
    return null;
  }

  const remainingMs = Math.max(
    0,
    round.endsAt.getTime() - occurredAt.getTime(),
  );
  return Math.max(0, round.durationMs - remainingMs);
}
