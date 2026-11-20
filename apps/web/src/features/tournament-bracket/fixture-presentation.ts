import type { ActiveBracket } from '@/services/api/admin-management';
import { isThirdPlaceRound } from '@martial-arts-scoring/shared-types';
import { MatchDisplayState, MatchLifecycle } from '@/types/shared';

export type BracketFixture = ActiveBracket['fixtures'][number];
export type ManualWinnerDecisionType = 'ADMIN_TIEBREAK' | 'WITHDRAWAL_OR_INJURY' | 'ADMIN_OVERRIDE';

/** Which manual winner decision, if any, an administrator may record for a fixture. */
export function manualWinnerDecisionType(fixture: BracketFixture): ManualWinnerDecisionType | null {
  if (fixture.status === 'AWAITING_WINNER') return 'ADMIN_TIEBREAK';
  if (fixture.status === 'READY' && fixture.match === null) return 'WITHDRAWAL_OR_INJURY';
  // After preparation, during the match, or after completion the administrator
  // can still declare or correct the official winner.
  if (fixture.status !== 'PENDING_PARTICIPANTS') return 'ADMIN_OVERRIDE';
  return null;
}

export function manualWinnerCandidates(fixture: BracketFixture) {
  return manualWinnerDecisionType(fixture)
    ? fixture.slots.flatMap((slot) => (slot.resolvedEntrant ? [slot.resolvedEntrant] : []))
    : [];
}

/** A manual decision needs exactly two resolved entrants to choose between. */
export function canDecideManually(fixture: BracketFixture): boolean {
  return manualWinnerCandidates(fixture).length === 2;
}

export function fixtureSurfaceClassName(fixture: BracketFixture): string {
  if (fixture.match?.lifecycle === MatchLifecycle.COMPLETED) return 'bg-blue-50/80';
  if (fixture.match?.lifecycle === MatchLifecycle.IN_PROGRESS) return 'bg-amber-50/80';
  if (fixture.displayState === MatchDisplayState.READY) return 'bg-emerald-50/80';
  if (fixture.displayState === MatchDisplayState.IN_PROGRESS) return 'bg-amber-50/80';
  if (fixture.displayState === MatchDisplayState.COMPLETED) return 'bg-blue-50/80';
  return 'bg-white';
}

/**
 * Sort key that puts rounds in playing order: the third-place match ("Tranh
 * hạng 3"), stored after the final, is played just before it.
 */
export function roundPlayOrder(roundNumber: number, roundCount: number): number {
  return isThirdPlaceRound(roundNumber, roundCount) ? roundCount - 0.5 : roundNumber;
}

/** Groups fixtures by round number, preserving the order in which rounds first appear. */
export function groupFixturesByRound(
  fixtures: readonly BracketFixture[],
): ReadonlyMap<number, readonly BracketFixture[]> {
  const groups = new Map<number, BracketFixture[]>();
  for (const fixture of fixtures) {
    const group = groups.get(fixture.roundNumber);
    if (group) group.push(fixture);
    else groups.set(fixture.roundNumber, [fixture]);
  }
  return groups;
}

/** Label for one side of a fixture, given a lookup of fixture references by ID. */
export function fixtureSideLabel(
  fixture: BracketFixture,
  side: 'RED' | 'BLUE',
  referenceById: ReadonlyMap<string, string>,
): string {
  const slot = fixture.slots.find((candidate) => candidate.side === side);
  if (slot?.resolvedEntrant) return slot.resolvedEntrant.snapshotName;
  if (slot?.sourceFixtureId) {
    const outcome = slot.sourceOutcome === 'LOSER' ? 'thua' : 'thắng';
    return `Chờ người ${outcome} ${referenceById.get(slot.sourceFixtureId) ?? ''}`;
  }
  return 'Chờ xác định';
}

/** Published final score of the fixture's match, or null when there is no scored result yet. */
export function fixtureScore(
  fixture: BracketFixture,
): { readonly RED: number; readonly BLUE: number } | null {
  return fixture.match?.score ?? null;
}

const fileTimestampFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** File name for a downloaded bracket chart, stamped in Vietnam local time. */
export function bracketPdfFileName(
  parts: {
    readonly tournamentName: string;
    readonly sportName: string;
    readonly weightClassName: string;
  },
  now: Date = new Date(),
): string {
  const stamp = fileTimestampFormat.format(now).replace(' ', '_').replaceAll(':', '-');
  return `So-do-nhanh-dau_${parts.tournamentName}_${parts.sportName}_${parts.weightClassName}_${stamp}`;
}

/**
 * Parses a non-negative whole number of seconds, or returns null when invalid.
 * A blank field means 0 (breaks off), as the form has always treated it.
 */
export function parseIntermissionSeconds(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;
  return /^\d+$/u.test(text) ? Number(text) : null;
}

/** Why the setting cannot change right now, or null when it can. */
export function thirdPlaceLockReason(bracket: ActiveBracket | undefined): string | null {
  if (!bracket) return null;
  if (bracket.bracket.status === 'COMPLETED')
    return 'Nhánh đấu đã hoàn tất nên không thể thay đổi.';
  const thirdPlace = bracket.fixtures.find((fixture) =>
    isThirdPlaceRound(fixture.roundNumber, bracket.bracket.roundCount),
  );
  if (
    thirdPlace &&
    (thirdPlace.match !== null ||
      ['MATCH_PREPARED', 'AWAITING_WINNER', 'COMPLETED'].includes(thirdPlace.status))
  )
    return 'Trận tranh hạng 3 đã được nhận hoặc đã có kết quả nên không thể tắt.';
  return null;
}
