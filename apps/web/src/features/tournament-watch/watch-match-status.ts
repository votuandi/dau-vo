import { MatchLifecycle } from '@/types/shared';
import {
  presentDisplayState,
  presentPhase,
  type MatchPresentation,
} from '@/features/match-presentation';
import type { WatchMatch } from '@/services/api/watch';

/** While a match runs, the phase ("Hiệp 1", "Nghỉ giữa hiệp"…) says more than "Đang diễn ra". */
export function watchMatchStatus(
  match: Pick<WatchMatch, 'lifecycle' | 'phase' | 'currentRound' | 'displayState'>,
): MatchPresentation {
  return match.lifecycle === MatchLifecycle.IN_PROGRESS
    ? presentPhase(match.phase, match.currentRound)
    : presentDisplayState(match.displayState);
}
