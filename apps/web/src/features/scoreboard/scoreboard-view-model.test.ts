import {
  AthleteColor,
  MatchLifecycle,
  MatchStatus,
  type PublicMatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import { describe, expect, it } from 'vitest';
import {
  buildScoreboardViewModel,
  committedScoresLabel,
  roundLabel,
  validateMatchIdChange,
} from './scoreboard-view-model';

function athlete(color: AthleteColor, name: string) {
  return {
    color,
    name,
    organization: null,
    athleteImagePath: null,
    organizationImagePath: null,
    score: 0,
    violations: 0,
    faultCounts: { minor: 0, major: 0 },
  };
}

function snapshot(match: Partial<PublicMatchStatePayload['match']> = {}): PublicMatchStatePayload {
  return {
    activeRound: null,
    intermissionEndsAt: '2030-01-01T00:01:00.000Z',
    athletes: [athlete(AthleteColor.RED, 'Đỏ'), athlete(AthleteColor.BLUE, 'Xanh')],
    committedScores: { source: null, attemptNumber: null, RED: null, BLUE: null },
    generatedAt: '2030-01-01T00:00:00.000Z',
    match: {
      currentRound: 1,
      finishedAt: null,
      intermissionEndsAt: null,
      lifecycle: MatchLifecycle.IN_PROGRESS,
      phase: MatchStatus.ROUND_1_RUNNING,
      publicId: 'A72K9P',
      rulesVersion: 'FAULT_APPEAL_OVERTIME_V2',
      status: MatchStatus.ROUND_1_RUNNING,
      outcome: null,
      ...match,
    },
  };
}

describe('validateMatchIdChange', () => {
  it('normalizes a new match ID', () => {
    expect(validateMatchIdChange('  b55x ', 'A72K9P')).toEqual({ ok: true, matchId: 'B55X' });
  });

  it('rejects an empty or unchanged ID', () => {
    expect(validateMatchIdChange('   ', 'A72K9P')).toEqual({
      ok: false,
      error: 'Mã trận đấu không chính xác',
    });
    expect(validateMatchIdChange('a72k9p', 'A72K9P')).toEqual({
      ok: false,
      error: 'Đây là mã trận đấu cũ',
    });
  });
});

describe('labels', () => {
  it('labels regulation and overtime rounds', () => {
    const base = {
      endedAt: null,
      endsAt: '2030-01-01T00:02:00.000Z',
      pausedAt: null,
      remainingDurationMs: null,
      startedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(roundLabel(null)).toBeNull();
    expect(roundLabel({ ...base, stage: 'REGULATION', roundNumber: 2, attemptNumber: 0 })).toBe(
      'HIỆP 2',
    );
    expect(roundLabel({ ...base, stage: 'OVERTIME', roundNumber: 3, attemptNumber: 1 })).toBe(
      'HIỆP PHỤ LẦN 1',
    );
  });

  it('labels committed scores only when both sides are known', () => {
    expect(
      committedScoresLabel({ source: 'REGULATION', attemptNumber: null, RED: 3, BLUE: null }),
    ).toBeNull();
    expect(committedScoresLabel({ source: 'OVERTIME', attemptNumber: 2, RED: 7, BLUE: 6 })).toBe(
      'Điểm hiệp phụ lần 2: Đỏ 7 · Xanh 6',
    );
  });
});

describe('buildScoreboardViewModel', () => {
  it('uses stable placeholders before the first snapshot', () => {
    const first = buildScoreboardViewModel(null, false);
    const second = buildScoreboardViewModel(null, false);
    expect(first.theme).toBe('arena');
    expect(first.presentation).toBeNull();
    expect(first.red.name).toBe('Võ sĩ Đỏ');
    expect(first.red).toBe(second.red);
    expect(first.blue).toBe(second.blue);
  });

  it.each([
    [MatchStatus.ROUND_1_PAUSED, false],
    [MatchStatus.REGULATION_APPEAL, false],
    [MatchStatus.OVERTIME_APPEAL, false],
    [MatchStatus.BREAK, true],
  ])('switches to the attention theme for %s', (phase, intermissionActive) => {
    expect(buildScoreboardViewModel(snapshot({ phase }), intermissionActive).theme).toBe(
      'attention',
    );
  });

  it('only exposes the intermission deadline during a break', () => {
    expect(buildScoreboardViewModel(snapshot(), false).intermissionEndsAt).toBeNull();
    expect(
      buildScoreboardViewModel(snapshot({ phase: MatchStatus.BREAK }), true).intermissionEndsAt,
    ).toBe('2030-01-01T00:01:00.000Z');
  });

  it('presents the suspended lifecycle over the phase', () => {
    const view = buildScoreboardViewModel(snapshot({ lifecycle: MatchLifecycle.SUSPENDED }), false);
    expect(view.presentation?.label).toBe('Tạm hoãn');
  });

  it('selects the published winner and its theme', () => {
    const view = buildScoreboardViewModel(
      snapshot({ outcome: { winner: AthleteColor.BLUE, method: 'MANUAL_AFTER_OVERTIME_TIE' } }),
      false,
    );
    expect(view.winner?.name).toBe('Xanh');
    expect(view.theme).toBe('blue-winner');
    expect(view.winnerNote).toBe('Quyết định giám sát sau hiệp phụ');
  });
});

describe('round label de-duplication', () => {
  it('hides a round label that repeats the phase label', () => {
    const round = {
      endedAt: null,
      endsAt: '2030-01-01T00:02:00.000Z',
      pausedAt: null,
      remainingDurationMs: null,
      roundNumber: 1,
      attemptNumber: 0,
      stage: 'REGULATION' as const,
      startedAt: '2030-01-01T00:00:00.000Z',
    };
    const running = { ...snapshot(), activeRound: round };
    expect(buildScoreboardViewModel(running, false).roundLabel).toBeNull();

    const overtime = {
      ...snapshot({ phase: MatchStatus.OVERTIME_RUNNING }),
      activeRound: { ...round, stage: 'OVERTIME' as const, attemptNumber: 2 },
    };
    expect(buildScoreboardViewModel(overtime, false).roundLabel).toBe('HIỆP PHỤ LẦN 2');
  });
});
