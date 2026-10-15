import { useEffect, useState } from 'react';

/** Formats a millisecond duration as `MM:SS`, rounding partial seconds up. */
export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Offset (server minus browser clock) derived from a snapshot's `generatedAt`. */
export function serverClockOffset(generatedAt: string | undefined, browserNow: number): number {
  const serverNow = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
  return Number.isNaN(serverNow) ? 0 : serverNow - browserNow;
}

/** Remaining milliseconds until `endsAt` on the server clock, or null when unknown. */
export function remainingUntil(
  endsAt: string | null | undefined,
  browserNow: number,
  offset: number,
): number | null {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  return Number.isNaN(end) ? null : Math.max(0, end - (browserNow + offset));
}

const TICK_MS = 250;

interface ServerClock {
  readonly endsAt: string | null | undefined;
  readonly generatedAt: string | undefined;
  readonly now: number;
  readonly offset: number;
}

function readServerClock(
  endsAt: string | null | undefined,
  generatedAt: string | undefined,
): ServerClock {
  const now = Date.now();
  return { endsAt, generatedAt, now, offset: serverClockOffset(generatedAt, now) };
}

/**
 * A browser clock reading tied to one (endsAt, generatedAt) pair. When either
 * changes the reading is refreshed during render, so the first frame for a new
 * deadline never uses a timestamp taken minutes earlier.
 */
function useServerClock(
  endsAt: string | null | undefined,
  generatedAt: string | undefined,
): readonly [ServerClock, (clock: ServerClock) => void] {
  const [clock, setClock] = useState(() => readServerClock(endsAt, generatedAt));
  if (clock.endsAt !== endsAt || clock.generatedAt !== generatedAt) {
    const fresh = readServerClock(endsAt, generatedAt);
    setClock(fresh);
    return [fresh, setClock];
  }
  return [clock, setClock];
}

/**
 * Display-only countdown towards a server-projected deadline. The server stays
 * authoritative; the browser never uses this value to transition state.
 *
 * It polls frequently so the second boundary is shown promptly, but only
 * re-renders when the displayed second actually changes.
 */
export function useServerCountdown(
  endsAt: string | null | undefined,
  generatedAt: string | undefined,
): number | null {
  const [clock, setClock] = useServerClock(endsAt, generatedAt);
  const { offset } = clock;

  useEffect(() => {
    if (!endsAt) return;

    let shownSecond = Math.ceil((remainingUntil(endsAt, Date.now(), offset) ?? 0) / 1_000);
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      const second = Math.ceil((remainingUntil(endsAt, tickNow, offset) ?? 0) / 1_000);
      if (second === shownSecond) return;
      shownSecond = second;
      setClock({ endsAt, generatedAt, now: tickNow, offset });
    }, TICK_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, generatedAt, offset, setClock]);

  return remainingUntil(endsAt, clock.now, offset);
}

/**
 * Whether a server-projected deadline is still ahead. Unlike
 * `useServerCountdown` it re-renders only when the answer flips, so a whole
 * screen can depend on it without redrawing every second.
 */
export function useBeforeServerDeadline(
  endsAt: string | null | undefined,
  generatedAt: string | undefined,
): boolean {
  const [clock, setClock] = useServerClock(endsAt, generatedAt);
  const { offset } = clock;
  const remaining = remainingUntil(endsAt, clock.now, offset);

  useEffect(() => {
    if (!endsAt || !remaining) return;
    const timeout = window.setTimeout(() => {
      setClock({ endsAt, generatedAt, now: Date.now(), offset });
    }, remaining);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [endsAt, generatedAt, offset, remaining, setClock]);

  return (remaining ?? 0) > 0;
}
