import { describe, expect, it } from 'vitest';
import { MatchDisplayState, MatchLifecycle, MatchPhase } from '@martial-arts-scoring/shared-types';
import {
  bracketPdfFileName,
  canDecideManually,
  fixtureSideLabel,
  fixtureSurfaceClassName,
  groupFixturesByRound,
  manualWinnerCandidates,
  manualWinnerDecisionType,
  parseIntermissionSeconds,
  type BracketFixture,
} from './fixture-presentation';

function entrant(id: string, name: string) {
  return {
    id,
    snapshotName: name,
    snapshotOrganization: null,
    snapshotImagePath: null,
    isSeed: false,
  };
}

function fixture(overrides: Partial<BracketFixture> = {}): BracketFixture {
  return {
    id: 'f-1',
    displayReference: 'TK-01',
    roundNumber: 1,
    position: 1,
    status: 'READY',
    displayState: MatchDisplayState.READY,
    match: null,
    winnerEntrant: null,
    slots: [
      {
        side: 'RED',
        sourceFixtureId: null,
        resolvedEntrant: entrant('a', 'An'),
        directEntrant: null,
      },
      {
        side: 'BLUE',
        sourceFixtureId: null,
        resolvedEntrant: entrant('b', 'Bình'),
        directEntrant: null,
      },
    ],
    ...overrides,
  };
}

describe('manual winner decisions', () => {
  it('allows a withdrawal decision for a ready fixture without a match', () => {
    const ready = fixture();
    expect(manualWinnerDecisionType(ready)).toBe('WITHDRAWAL_OR_INJURY');
    expect(manualWinnerCandidates(ready).map((candidate) => candidate.id)).toEqual(['a', 'b']);
    expect(canDecideManually(ready)).toBe(true);
  });

  it('allows a tiebreak decision for an awaiting fixture', () => {
    expect(manualWinnerDecisionType(fixture({ status: 'AWAITING_WINNER' }))).toBe('ADMIN_TIEBREAK');
  });

  it('offers no decision once a match is prepared', () => {
    const prepared = fixture({
      status: 'MATCH_PREPARED',
      match: {
        id: 'm',
        publicId: 'M-1',
        lifecycle: MatchLifecycle.NOT_STARTED,
        phase: MatchPhase.WAITING,
        status: MatchPhase.WAITING,
      },
    });
    expect(manualWinnerDecisionType(prepared)).toBeNull();
    expect(manualWinnerCandidates(prepared)).toEqual([]);
    expect(canDecideManually(prepared)).toBe(false);
  });

  it('needs both entrants resolved', () => {
    const half = fixture({
      slots: [
        {
          side: 'RED',
          sourceFixtureId: null,
          resolvedEntrant: entrant('a', 'An'),
          directEntrant: null,
        },
        { side: 'BLUE', sourceFixtureId: 'f-0', resolvedEntrant: null, directEntrant: null },
      ],
    });
    expect(canDecideManually(half)).toBe(false);
  });
});

describe('fixture presentation', () => {
  it('colors fixtures by lifecycle before display state', () => {
    expect(fixtureSurfaceClassName(fixture())).toBe('bg-emerald-50/80');
    expect(fixtureSurfaceClassName(fixture({ displayState: MatchDisplayState.NOT_READY }))).toBe(
      'bg-white',
    );
    expect(
      fixtureSurfaceClassName(
        fixture({
          displayState: MatchDisplayState.READY,
          match: {
            id: 'm',
            publicId: 'M-1',
            lifecycle: MatchLifecycle.COMPLETED,
            phase: MatchPhase.FINISHED,
            status: MatchPhase.FINISHED,
          },
        }),
      ),
    ).toBe('bg-blue-50/80');
  });

  it('labels resolved, pending and undetermined sides', () => {
    const references = new Map([['f-0', 'TK-00']]);
    const pending = fixture({
      slots: [
        {
          side: 'RED',
          sourceFixtureId: null,
          resolvedEntrant: entrant('a', 'An'),
          directEntrant: null,
        },
        { side: 'BLUE', sourceFixtureId: 'f-0', resolvedEntrant: null, directEntrant: null },
      ],
    });
    expect(fixtureSideLabel(pending, 'RED', references)).toBe('An');
    expect(fixtureSideLabel(pending, 'BLUE', references)).toBe('Chờ người thắng TK-00');
    expect(fixtureSideLabel(fixture({ slots: [] }), 'RED', references)).toBe('Chờ xác định');
  });

  it('groups fixtures by round in first-seen order', () => {
    const groups = groupFixturesByRound([
      fixture({ id: 'a', roundNumber: 1 }),
      fixture({ id: 'b', roundNumber: 2 }),
      fixture({ id: 'c', roundNumber: 1 }),
    ]);
    expect([...groups.keys()]).toEqual([1, 2]);
    expect(groups.get(1)?.map((item) => item.id)).toEqual(['a', 'c']);
  });
});

describe('bracketPdfFileName', () => {
  it('stamps the file name in Vietnam local time', () => {
    expect(
      bracketPdfFileName(
        { tournamentName: 'Giải A', sportName: 'Vovinam', weightClassName: '48kg' },
        new Date('2030-01-01T17:30:05Z'),
      ),
    ).toBe('So-do-nhanh-dau_Giải A_Vovinam_48kg_2030-01-02_00-30-05');
  });
});

describe('parseIntermissionSeconds', () => {
  it.each([
    ['0', 0],
    ['45', 45],
    [' 30 ', 30],
    ['', null],
    ['-1', null],
    ['1.5', null],
    ['abc', null],
  ])('parses %j as %j', (input, expected) => {
    expect(parseIntermissionSeconds(input)).toBe(expected);
  });
});
