import type { AthleteColor, PublicMatchStatePayload } from '@martial-arts-scoring/shared-types';
import { useBeforeServerDeadline } from '@/features/match-timer/server-countdown';
import { judgeVotesFlashUntil } from './scoreboard-view-model';

export interface AwardedFlash {
  /** The athlete awarded the point by the last call, while it is being highlighted. */
  readonly color: AthleteColor | null;
  /** Changes with every call, so a highlight restarts even for the same athlete. */
  readonly key: string | null;
}

/**
 * The short highlight after a call awards a point: it lasts JUDGE_VOTE_FLASH_MS on the
 * server clock, so every scoreboard ends it together, and a new referee-command scoring
 * stop ends it at once. Calls without a majority are not highlighted.
 */
export function useAwardedFlash(
  judgeVotes: PublicMatchStatePayload['judgeVotes'] | undefined,
  generatedAt: string | undefined,
  refereeScoringOpen: boolean,
): AwardedFlash {
  const flashing = useBeforeServerDeadline(judgeVotesFlashUntil(judgeVotes), generatedAt);
  const window = judgeVotes?.lastResolvedWindow;
  const color = flashing && !refereeScoringOpen ? (window?.winningColor ?? null) : null;
  return { color, key: color && window ? window.resolvedAt : null };
}
