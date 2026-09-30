import { MatchLifecycle } from '@/types/shared';

export function shouldMonitorLiveMatch(match: {
  readonly hasFinalOutcome: boolean;
  readonly lifecycle: MatchLifecycle;
}): boolean {
  return !(match.lifecycle === MatchLifecycle.COMPLETED && match.hasFinalOutcome);
}
