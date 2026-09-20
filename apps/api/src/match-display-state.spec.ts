import { BracketFixtureStatus, MatchLifecycle } from '@prisma/client';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';
import { projectMatchDisplayState } from './match-display-state';

describe('projectMatchDisplayState', () => {
  it.each([
    [MatchLifecycle.NOT_STARTED, MatchDisplayState.NOT_STARTED],
    [MatchLifecycle.IN_PROGRESS, MatchDisplayState.IN_PROGRESS],
    [MatchLifecycle.SUSPENDED, MatchDisplayState.SUSPENDED],
    [MatchLifecycle.COMPLETED, MatchDisplayState.COMPLETED],
  ])('projects operational lifecycle %s', (lifecycle, expected) => {
    expect(
      projectMatchDisplayState({ kind: 'OPERATIONAL_MATCH', lifecycle }),
    ).toBe(expected);
  });

  it('projects an unresolved fixture as not ready', () => {
    expect(
      projectMatchDisplayState({
        kind: 'BRACKET_FIXTURE',
        fixtureStatus: BracketFixtureStatus.PENDING_PARTICIPANTS,
      }),
    ).toBe(MatchDisplayState.NOT_READY);
  });

  it('projects a resolved unprepared fixture as ready', () => {
    expect(
      projectMatchDisplayState({
        kind: 'BRACKET_FIXTURE',
        fixtureStatus: BracketFixtureStatus.READY,
      }),
    ).toBe(MatchDisplayState.READY);
  });

  it.each([
    BracketFixtureStatus.MATCH_PREPARED,
    BracketFixtureStatus.AWAITING_WINNER,
    BracketFixtureStatus.COMPLETED,
  ])(
    'derives prepared fixture %s from its operational match',
    (fixtureStatus) => {
      expect(
        projectMatchDisplayState({
          kind: 'BRACKET_FIXTURE',
          fixtureStatus,
          lifecycle: MatchLifecycle.COMPLETED,
        }),
      ).toBe(MatchDisplayState.COMPLETED);
    },
  );
});
