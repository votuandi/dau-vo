import { BracketFixtureStatus, MatchLifecycle } from '@prisma/client';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';

type DisplayStateSource =
  | { kind: 'OPERATIONAL_MATCH'; lifecycle: MatchLifecycle }
  | {
      kind: 'BRACKET_FIXTURE';
      fixtureStatus: BracketFixtureStatus;
      lifecycle?: MatchLifecycle;
    };

/** The single projection used by API serializers for fixtures and matches. */
export function projectMatchDisplayState(
  source: DisplayStateSource,
): MatchDisplayState {
  if (source.kind === 'OPERATIONAL_MATCH') {
    return lifecycleDisplayState(source.lifecycle);
  }
  switch (source.fixtureStatus) {
    case BracketFixtureStatus.PENDING_PARTICIPANTS:
      return MatchDisplayState.NOT_READY;
    case BracketFixtureStatus.READY:
      return MatchDisplayState.READY;
    case BracketFixtureStatus.MATCH_PREPARED:
    case BracketFixtureStatus.AWAITING_WINNER:
    case BracketFixtureStatus.COMPLETED: {
      if (source.lifecycle === undefined) {
        throw new Error(
          `Fixture ${source.fixtureStatus} requires an operational match lifecycle`,
        );
      }
      return lifecycleDisplayState(source.lifecycle);
    }
    default: {
      const exhaustiveStatus: never = source.fixtureStatus;
      throw new Error(`Unsupported fixture status: ${exhaustiveStatus}`);
    }
  }
}

function lifecycleDisplayState(lifecycle: MatchLifecycle): MatchDisplayState {
  switch (lifecycle) {
    case MatchLifecycle.NOT_STARTED:
      return MatchDisplayState.NOT_STARTED;
    case MatchLifecycle.IN_PROGRESS:
      return MatchDisplayState.IN_PROGRESS;
    case MatchLifecycle.SUSPENDED:
      return MatchDisplayState.SUSPENDED;
    case MatchLifecycle.COMPLETED:
      return MatchDisplayState.COMPLETED;
    default: {
      const exhaustiveLifecycle: never = lifecycle;
      throw new Error(`Unsupported match lifecycle: ${exhaustiveLifecycle}`);
    }
  }
}
