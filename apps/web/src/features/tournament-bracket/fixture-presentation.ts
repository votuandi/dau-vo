import type { ActiveBracket } from '@/services/api/admin-management';
import { MatchDisplayState, MatchLifecycle } from '@/types/shared';

export type BracketFixture = ActiveBracket['fixtures'][number];
export type ManualWinnerDecisionType = 'ADMIN_TIEBREAK' | 'WITHDRAWAL_OR_INJURY';

/** Which manual winner decision, if any, an administrator may record for a fixture. */
export function manualWinnerDecisionType(fixture: BracketFixture): ManualWinnerDecisionType | null {
  if (fixture.status === 'AWAITING_WINNER') return 'ADMIN_TIEBREAK';
  if (fixture.status === 'READY' && fixture.match === null) return 'WITHDRAWAL_OR_INJURY';
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
    return `Chờ người thắng ${referenceById.get(slot.sourceFixtureId) ?? ''}`;
  }
  return 'Chờ xác định';
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

/** Parses a non-negative whole number of seconds, or returns null when invalid. */
export function parseIntermissionSeconds(value: string): number | null {
  if (!value.trim()) return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}
