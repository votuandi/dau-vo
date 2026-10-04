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
    [undefined, MatchDisplayState.COMPLETED],
    [MatchLifecycle.IN_PROGRESS, MatchDisplayState.IN_PROGRESS],
    [MatchLifecycle.SUSPENDED, MatchDisplayState.SUSPENDED],
  ])(
    'projects a completed fixture with lifecycle %s',
    (lifecycle, expected) => {
      expect(
        projectMatchDisplayState({
          kind: 'BRACKET_FIXTURE',
          fixtureStatus: BracketFixtureStatus.COMPLETED,
          ...(lifecycle === undefined ? {} : { lifecycle }),
        }),
      ).toBe(expected);
    },
  );

  it.each([
    BracketFixtureStatus.MATCH_PREPARED,
    BracketFixtureStatus.AWAITING_WINNER,
  ])('requires an operational match for fixture %s', (fixtureStatus) => {
    expect(() =>
      projectMatchDisplayState({ kind: 'BRACKET_FIXTURE', fixtureStatus }),
    ).toThrow(
      `Fixture ${fixtureStatus} requires an operational match lifecycle`,
    );
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
