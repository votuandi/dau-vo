import {
  AthleteColor,
  MatchLifecycle,
  MatchStatus,
  type PublicMatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import {
  isPausedPhase,
  isRunningPhase,
  presentLifecycle,
  presentPhase,
  type MatchPresentation,
} from '@/features/match-presentation';

export type ScoreboardAthlete = PublicMatchStatePayload['athletes'][number];
export type ScoreboardActiveRound = PublicMatchStatePayload['activeRound'];

/** Visual theme of the whole board; drives the page background. */
export type ScoreboardTheme = 'arena' | 'attention' | 'red-winner' | 'blue-winner';

function placeholderAthlete(color: AthleteColor): ScoreboardAthlete {
  return {
    color,
    name: color === AthleteColor.RED ? 'Võ sĩ Đỏ' : 'Võ sĩ Xanh',
    organization: 'Đang tải…',
    athleteImagePath: null,
    organizationImagePath: null,
    score: 0,
    violations: 0,
    faultCounts: { minor: 0, major: 0 },
  };
}

// Module-level so memoized panels keep a stable reference while loading.
const PLACEHOLDER_RED = placeholderAthlete(AthleteColor.RED);
const PLACEHOLDER_BLUE = placeholderAthlete(AthleteColor.BLUE);

export function normalizeMatchId(value: string): string {
  return value.trim().toUpperCase();
}

export function scoreboardPath(matchPublicId: string): string {
  return `/bang-diem?match=${encodeURIComponent(matchPublicId)}`;
}

export type MatchIdChange =
  { readonly ok: true; readonly matchId: string } | { readonly ok: false; readonly error: string };

/** Validates a new match ID typed into the scoreboard header. */
export function validateMatchIdChange(draft: string, current: string): MatchIdChange {
  const matchId = normalizeMatchId(draft);
  if (!matchId) {
    return { ok: false, error: 'Mã trận đấu không chính xác' };
  }
  if (matchId === current) return { ok: false, error: 'Đây là mã trận đấu cũ' };
  return { ok: true, matchId };
}

export function roundLabel(round: ScoreboardActiveRound | undefined): string | null {
  if (!round) return null;
  return round.stage === 'OVERTIME'
    ? `HIỆP PHỤ LẦN ${String(round.attemptNumber)}`
    : `HIỆP ${String(round.roundNumber)}`;
}

export function committedScoresLabel(
  scores: PublicMatchStatePayload['committedScores'] | undefined,
): string | null {
  if (scores?.RED == null || scores.BLUE == null) return null;
  return scores.source === 'OVERTIME'
    ? `Điểm hiệp phụ lần ${String(scores.attemptNumber)}: Đỏ ${String(scores.RED)} · Xanh ${String(scores.BLUE)}`
    : `Điểm chung cuộc sau 2 hiệp: Đỏ ${String(scores.RED)} · Xanh ${String(scores.BLUE)}`;
}

export interface ScoreboardViewModel {
  readonly theme: ScoreboardTheme;
  readonly presentation: MatchPresentation | null;
  readonly running: boolean;
  readonly paused: boolean;
  readonly roundLabel: string | null;
  readonly red: ScoreboardAthlete;
  readonly blue: ScoreboardAthlete;
  readonly winner: ScoreboardAthlete | null;
  readonly winnerNote: string | null;
  readonly committedScoresLabel: string | null;
  readonly intermissionEndsAt: string | null;
}

/**
 * Pure projection of a public snapshot into what the scoreboard renders.
 * `intermissionActive` is time-based, so the caller supplies it.
 */
export function buildScoreboardViewModel(
  snapshot: PublicMatchStatePayload | null,
  intermissionActive: boolean,
): ScoreboardViewModel {
  const phase = snapshot?.match.phase;
  const running = isRunningPhase(phase);
  const paused = isPausedPhase(phase);
  const appeal = phase === MatchStatus.REGULATION_APPEAL || phase === MatchStatus.OVERTIME_APPEAL;
  const winnerColor = snapshot?.match.outcome?.winner;
  const winner = winnerColor
    ? (snapshot.athletes.find((athlete) => athlete.color === winnerColor) ?? null)
    : null;

  let theme: ScoreboardTheme = 'arena';
  if (winner) theme = winner.color === AthleteColor.RED ? 'red-winner' : 'blue-winner';
  else if (paused || intermissionActive || appeal) theme = 'attention';

  const presentation = snapshot
    ? snapshot.match.lifecycle === MatchLifecycle.SUSPENDED
      ? presentLifecycle(snapshot.match.lifecycle)
      : presentPhase(snapshot.match.phase)
    : null;
  const round = roundLabel(snapshot?.activeRound);

  return {
    theme,
    presentation,
    running,
    paused,
    // "Hiệp 1" already reads as "HIỆP 1"; avoid showing the same words twice.
    roundLabel: round === presentation?.label.toUpperCase() ? null : round,
    red:
      snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED) ?? PLACEHOLDER_RED,
    blue:
      snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE) ?? PLACEHOLDER_BLUE,
    winner,
    winnerNote:
      snapshot?.match.outcome?.method === 'MANUAL_AFTER_OVERTIME_TIE'
        ? 'Quyết định giám sát sau hiệp phụ'
        : null,
    committedScoresLabel: committedScoresLabel(snapshot?.committedScores),
    intermissionEndsAt: phase === MatchStatus.BREAK ? (snapshot?.intermissionEndsAt ?? null) : null,
  };
}
