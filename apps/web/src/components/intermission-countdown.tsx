import { useEffect, useRef, useState } from 'react';

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Display-only: the server-projected absolute deadline remains authoritative. */
export function IntermissionCountdown({
  endsAt,
  generatedAt,
}: {
  readonly endsAt: string | null | undefined;
  readonly generatedAt: string | undefined;
}) {
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
  if (!endsAt || remaining <= 0) return null;

  return (
    <div className="mt-3" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-wider text-sky-100/80">
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
