/* eslint-disable react-refresh/only-export-components -- this display hook is shared by three match views. */
import { formatCountdown, useServerCountdown } from '@/features/match-timer/server-countdown';

/**
 * Display-only presentation state. The server deadline remains authoritative;
 * this only keeps an already-projected intermission from retaining its visual
 * treatment after the deadline passes locally.
 */
export function useIntermissionActive(
  endsAt: string | null | undefined,
  generatedAt: string | undefined,
): { readonly active: boolean; readonly remaining: number } {
  const remaining = useServerCountdown(endsAt, generatedAt) ?? 0;
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
        aria-label={`Thời gian giải lao còn lại ${formatCountdown(remaining)}`}
        className="mt-1 font-mono text-4xl font-black tabular-nums sm:text-5xl"
        role="timer"
      >
        {formatCountdown(remaining)}
      </p>
    </div>
  );
}
