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
  const [clock, setClock] = useState(() => {
    const now = Date.now();
    return { now, offset: serverClockOffset(generatedAt, now) };
  });

  useEffect(() => {
    const now = Date.now();
    const offset = serverClockOffset(generatedAt, now);
    setClock({ now, offset });
    if (!endsAt) return;

    let shownSecond = Math.ceil((remainingUntil(endsAt, now, offset) ?? 0) / 1_000);
    const interval = window.setInterval(() => {
      const tickNow = Date.now();
      const second = Math.ceil((remainingUntil(endsAt, tickNow, offset) ?? 0) / 1_000);
      if (second === shownSecond) return;
      shownSecond = second;
      setClock({ now: tickNow, offset });
    }, TICK_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, generatedAt]);

  return remainingUntil(endsAt, clock.now, clock.offset);
}
