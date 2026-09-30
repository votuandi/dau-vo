/* eslint-disable react-refresh/only-export-components -- this display hook is shared by three match views. */
import { useEffect, useRef, useState } from 'react';

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Display-only presentation state. The server deadline remains authoritative;
 * this only keeps an already-projected intermission from retaining its visual
 * treatment after the deadline passes locally.
 */
export function useIntermissionActive(
  endsAt: string | null | undefined,
  generatedAt: string | undefined,
): { readonly active: boolean; readonly remaining: number } {
  const [now, setNow] = useState(() => Date.now());
  const serverOffset = useRef(0);

  useEffect(() => {
    const localNow = Date.now();
    const serverNow = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    serverOffset.current = Number.isNaN(serverNow) ? 0 : serverNow - localNow;
    setNow(localNow);
    if (!endsAt) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, generatedAt]);

  const end = endsAt ? new Date(endsAt).getTime() : Number.NaN;
  const remaining = Number.isNaN(end) ? 0 : Math.max(0, end - (now + serverOffset.current));
  return { active: remaining > 0, remaining };
}

/** Display-only: the server-projected absolute deadline remains authoritative. */
export function IntermissionCountdown({
  endsAt,
  generatedAt,
}: {
  readonly endsAt: string | null | undefined;
  readonly generatedAt: string | undefined;
}) {
  const { active, remaining } = useIntermissionActive(endsAt, generatedAt);
  if (!active) return null;

  return (
    <div className="mt-3" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-100/90">
        Thời gian giải lao giữa hiệp
      </p>
      <p
        aria-label={`Thời gian giải lao còn lại ${formatRemaining(remaining)}`}
        className="mt-1 font-mono text-4xl font-black tabular-nums sm:text-5xl"
        role="timer"
      >
        {formatRemaining(remaining)}
      </p>
    </div>
  );
}
