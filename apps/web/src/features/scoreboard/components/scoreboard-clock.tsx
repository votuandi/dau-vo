import { formatCountdown, useServerCountdown } from '@/features/match-timer/server-countdown';

/**
 * The only part of the board that ticks; isolating it keeps the athlete panels
 * from re-rendering every second.
 */
export function ScoreboardClock({
  endsAt,
  generatedAt,
  pausedRemainingMs,
  running,
}: {
  readonly endsAt: string | undefined;
  readonly generatedAt: string | undefined;
  readonly pausedRemainingMs: number | null;
  readonly running: boolean;
}) {
  const remaining = useServerCountdown(running ? endsAt : undefined, generatedAt);
  const display =
    running && remaining !== null
      ? formatCountdown(remaining)
      : pausedRemainingMs !== null
        ? formatCountdown(pausedRemainingMs)
        : '--:--';

  return (
    <p
      aria-label={display === '--:--' ? 'Chưa có thời gian' : `Thời gian còn lại ${display}`}
      className="font-mono text-[clamp(3.25rem,15vmin,9.5rem)] font-black leading-none tabular-nums"
      role="timer"
    >
      {display}
    </p>
  );
}
