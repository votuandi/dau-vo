import type {
  AthleteColor,
  MatchDisplayState,
  MatchLifecycle,
  MatchPhase,
} from '@martial-arts-scoring/shared-types';
import type { ActiveBracket } from './admin-management';
import { apiClient } from './client';

export interface WatchTournament {
  readonly publicCode: string;
  readonly name: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: 'DRAFT' | 'ACTIVE' | 'FINISHED';
  readonly imageUrl: string | null;
  readonly sport: { readonly name: string };
}

export interface WatchMatchAthlete {
  readonly color: AthleteColor;
  readonly name: string;
  readonly organization: string | null;
  readonly imageUrl: string | null;
}

export type WatchManualDecisionType = 'ADMIN_TIEBREAK' | 'WITHDRAWAL_OR_INJURY' | 'ADMIN_OVERRIDE';

interface WatchMatchBase {
  readonly id: string;
  readonly lifecycle: MatchLifecycle;
  readonly phase: MatchPhase;
  readonly displayState: MatchDisplayState;
  readonly currentRound: number | null;
  readonly regulationRoundCount: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
  readonly weightClass: { readonly id: string; readonly name: string } | null;
  readonly bracketRound: {
    readonly roundNumber: number;
    readonly position: number;
    readonly displayReference: string;
    readonly label: string;
  } | null;
  readonly athletes: readonly WatchMatchAthlete[];
  /** Published final score by corner; null until a scored result exists. */
  readonly score: { readonly RED: number; readonly BLUE: number } | null;
  readonly winnerColor: AthleteColor | null;
  /** The organiser chose the winner (withdrawal, injury, tie-break or override); null for rule-based results. */
  readonly manualDecision: {
    readonly type: WatchManualDecisionType;
    readonly reason: string | null;
  } | null;
}

/** A match that was (or will be) played, with its own scoreboard and result. */
export interface WatchPlayedMatch extends WatchMatchBase {
  readonly kind: 'MATCH';
  readonly publicId: string;
}

/** A bracket fixture the organiser decided before any match existed: no scoreboard, no result. */
export interface WatchDecidedFixture extends WatchMatchBase {
  readonly kind: 'DECIDED_FIXTURE';
  readonly publicId: null;
}

export type WatchMatch = WatchPlayedMatch | WatchDecidedFixture;

/** A sponsor as public screens show it ("Đang tài trợ" only, in display order). */
export interface PublicSponsor {
  readonly id: string;
  readonly name: string;
  readonly details: string | null;
  readonly imageUrl: string | null;
  /** "Link quảng cáo"; open only after `isSafeWebsiteUrl`. */
  readonly adUrl: string | null;
  readonly tier: number;
  readonly tierName: string;
}

export interface WatchOverview {
  readonly tournament: WatchTournament;
  readonly matches: readonly WatchMatch[];
  /** Absent on servers older than the sponsor strip. */
  readonly sponsors?: readonly PublicSponsor[];
}

export interface WatchBrackets {
  readonly weightClasses: readonly {
    readonly id: string;
    readonly name: string;
    readonly bracket: Omit<ActiveBracket, 'activeRefereeCount' | 'staffing'> | null;
  }[];
}

export interface WatchCornerScore {
  readonly baseScore: number;
  readonly bonusPoints: number;
  readonly penaltyPoints: number;
  readonly finalScore: number;
}

export type WatchOutcomeMethod =
  'REGULATION_SCORE' | 'OVERTIME_SCORE' | 'MANUAL_AFTER_OVERTIME_TIE' | 'ADMIN_MANUAL';

export interface WatchMatchResult {
  readonly match: WatchPlayedMatch;
  readonly rounds: readonly {
    readonly stage: 'REGULATION' | 'OVERTIME';
    readonly roundNumber: number;
    readonly attemptNumber: number;
    readonly startedAt: string;
    readonly endedAt: string | null;
    readonly results: Record<
      'RED' | 'BLUE',
      { readonly judgePoints: number; readonly faultCount: number } | null
    >;
  }[];
  readonly scoreSummary: {
    readonly scope: 'REGULATION' | 'OVERTIME';
    readonly RED: WatchCornerScore | null;
    readonly BLUE: WatchCornerScore | null;
  } | null;
  readonly outcome: {
    readonly winnerColor: AthleteColor;
    readonly method: WatchOutcomeMethod;
    readonly publishedAt: string;
  } | null;
}

const base = (code: string) => `watch/tournaments/${encodeURIComponent(code)}`;

export const publicSponsorsApi = {
  byTournament: (code: string) =>
    apiClient.get<{ readonly sponsors: readonly PublicSponsor[] }>(
      `public/tournaments/${encodeURIComponent(code)}/sponsors`,
      { credentials: 'omit' },
    ),
  byMatch: (matchPublicId: string) =>
    apiClient.get<{ readonly sponsors: readonly PublicSponsor[] }>(
      `public/matches/${encodeURIComponent(matchPublicId)}/sponsors`,
      { credentials: 'omit' },
    ),
};

export const watchApi = {
  overview: (code: string) => apiClient.get<WatchOverview>(base(code)),
  brackets: (code: string) => apiClient.get<WatchBrackets>(`${base(code)}/brackets`),
  matchResult: (code: string, publicId: string) =>
    apiClient.get<WatchMatchResult>(`${base(code)}/matches/${encodeURIComponent(publicId)}/result`),
};
