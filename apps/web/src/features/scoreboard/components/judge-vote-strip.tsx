import { memo } from 'react';
import { AthleteColor, type PublicMatchStatePayload } from '@martial-arts-scoring/shared-types';
import { useBeforeServerDeadline } from '@/features/match-timer/server-countdown';
import { cn } from '@/lib/utils';
import { judgeVoteCells, judgeVotesHoldUntil } from '../scoreboard-view-model';

const VOTE_LABEL = { [AthleteColor.RED]: 'Đỏ', [AthleteColor.BLUE]: 'Xanh' } as const;

function resultLabel(winningColor: AthleteColor | null): string {
  return winningColor
    ? `Cộng điểm cho ${VOTE_LABEL[winningColor].toUpperCase()}`
    : 'Không đủ đa số — không cộng điểm';
}

/**
 * One cell per judge. After a scoring window resolves, each cell briefly takes
 * the colour of the athlete that judge chose, so spectators can see why a
 * point was (or was not) awarded.
 */
export const JudgeVoteStrip = memo(function JudgeVoteStrip({
  judgeVotes,
  generatedAt,
}: {
  readonly judgeVotes: PublicMatchStatePayload['judgeVotes'] | undefined;
  readonly generatedAt: string | undefined;
}) {
  const showVotes = useBeforeServerDeadline(judgeVotesHoldUntil(judgeVotes), generatedAt);
  const cells = judgeVoteCells(judgeVotes, showVotes);
  if (cells.length === 0) return null;
  const resolved = showVotes ? judgeVotes?.lastResolvedWindow : null;

  return (
    <section
      aria-label="Giám định chấm điểm"
      className="flex flex-wrap items-center justify-center gap-x-[clamp(0.5rem,2vmin,1.5rem)] gap-y-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-[clamp(0.375rem,1.2vmin,0.75rem)] backdrop-blur"
    >
      <p className="text-[clamp(0.75rem,1.9vmin,1.125rem)] font-black uppercase tracking-[0.18em] text-sky-100">
        Giám định
      </p>
      <ul className="flex flex-wrap justify-center gap-[clamp(0.375rem,1.2vmin,0.75rem)]">
        {cells.map(({ position, vote }) => (
          <li
            aria-label={`Giám định ${String(position)}: ${vote ? VOTE_LABEL[vote] : 'không chọn'}`}
            className={cn(
              'grid min-w-[clamp(3.5rem,11vmin,7rem)] place-items-center rounded-xl border-2 px-3 py-[clamp(0.25rem,1vmin,0.625rem)] text-[clamp(0.875rem,2.6vmin,1.5rem)] font-black tabular-nums transition-[background-color,border-color,transform] duration-300',
              vote === AthleteColor.RED
                ? 'scale-105 border-red-200 bg-red-600 shadow-lg shadow-red-950/40'
                : vote === AthleteColor.BLUE
                  ? 'scale-105 border-sky-200 bg-blue-700 shadow-lg shadow-blue-950/40'
                  : 'border-dashed border-white/30 bg-black/20 text-white/70',
            )}
            data-vote={vote ?? 'NONE'}
            key={position}
          >
            GĐ {position}
          </li>
        ))}
      </ul>
      <p
        aria-live="polite"
        className={cn(
          'min-w-[16ch] text-center text-[clamp(0.75rem,1.9vmin,1.125rem)] font-bold',
          resolved?.winningColor === AthleteColor.RED
            ? 'text-red-200'
            : resolved?.winningColor === AthleteColor.BLUE
              ? 'text-sky-200'
              : 'text-amber-100',
        )}
      >
        {resolved ? resultLabel(resolved.winningColor) : null}
      </p>
    </section>
  );
});
