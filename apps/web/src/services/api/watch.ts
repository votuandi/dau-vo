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

export interface WatchMatch {
  readonly id: string;
  readonly publicId: string;
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
}

export interface WatchOverview {
  readonly tournament: WatchTournament;
  readonly matches: readonly WatchMatch[];
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
  readonly match: WatchMatch;
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

export const watchApi = {
  overview: (code: string) => apiClient.get<WatchOverview>(base(code)),
  brackets: (code: string) => apiClient.get<WatchBrackets>(`${base(code)}/brackets`),
  matchResult: (code: string, publicId: string) =>
    apiClient.get<WatchMatchResult>(`${base(code)}/matches/${encodeURIComponent(publicId)}/result`),
};
