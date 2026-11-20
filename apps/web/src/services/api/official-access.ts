import { apiClient, request } from '@/services/api/client';
import { MatchLifecycle, MatchStatus, type TournamentOfficialRole } from '@/types/shared';
import type {
  TournamentPodiumAthlete,
  TournamentResultsAnnouncedPayload,
} from '@martial-arts-scoring/shared-types';
import type { AdminMatchMonitoring } from './admin-management';

/** A weight class whose final has an official winner: its podium can be announced. */
export interface AnnounceableTournamentResult {
  readonly bracketId: string;
  readonly weightClass: { readonly name: string };
  readonly finalMatchPublicId: string | null;
  readonly champion: TournamentPodiumAthlete;
  readonly completedAt: string | null;
  readonly resultsAnnouncedAt: string | null;
}

export interface OfficialAssignment {
  readonly id: string;
  readonly role: TournamentOfficialRole;
  readonly judgePosition: number | null;
  readonly match: { readonly id: string; readonly publicId: string; readonly status: MatchStatus };
}
export interface OfficialSession {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly expiresAt: string;
  readonly official: {
    readonly id: string;
    readonly name: string;
    readonly role: TournamentOfficialRole;
  };
  readonly tournament: { readonly id: string; readonly name: string; readonly publicCode: string };
  readonly activeAssignment: OfficialAssignment | null;
  readonly status: 'READY' | 'IN_MATCH';
}
export interface OfficialMatch {
  readonly id: string;
  readonly fixtureId?: string;
  readonly publicId: string;
  readonly lifecycle: MatchLifecycle;
  readonly status: MatchStatus;
  readonly requiredJudgeCount: number;
  readonly athletes: readonly { readonly color: string; readonly name: string }[];
  readonly claimable: boolean;
  readonly weightClass?: { readonly id: string; readonly name: string } | null;
  readonly roundNumber?: number | null;
  /** "Bán kết", "Chung kết", "Tranh hạng 3"…; absent on older servers. */
  readonly roundLabel?: string | null;
  readonly position?: number | null;
}
export interface OfficialReferee {
  readonly id: string;
  readonly name: string;
  readonly status: 'READY' | 'IN_MATCH' | 'DISABLED';
  readonly assignedMatchId: string | null;
}

interface OfficialMatchState {
  match: {
    id: string;
    lifecycle: MatchLifecycle;
    requiredJudgeCount: number;
    officialAssignments: readonly {
      officialId: string;
      role: TournamentOfficialRole;
      judgePosition: number | null;
      official: { name: string; isActive: boolean };
    }[];
  };
  referees: readonly OfficialReferee[];
  varMonitoring?: VarMonitoring;
}

// The supervisor endpoint deliberately exposes only these read-only histories,
// but their item shapes are the same read model used by admin monitoring.
export type VarMonitoring = Pick<
  AdminMatchMonitoring,
  'scoringWindows' | 'penalties' | 'scoreEvents' | 'auditLogs'
>;

export const officialAccessApi = {
  tokenLogin: (input: {
    token: string;
    deviceId: string;
    expectedRole: TournamentOfficialRole;
    takeoverToken?: string;
  }) => apiClient.post<{ session: OfficialSession }>('official-access/token/login', input),
  login: (input: {
    tournamentCode: string;
    privatePasscode: string;
    deviceId: string;
    expectedRole: TournamentOfficialRole;
  }) => apiClient.post<{ session: OfficialSession }>('official-access/login', input),
  takeover: (input: {
    tournamentCode: string;
    privatePasscode: string;
    deviceId: string;
    expectedRole: TournamentOfficialRole;
    takeoverToken: string;
  }) => apiClient.post<{ session: OfficialSession }>('official-access/takeover', input),
  logout: () => request<undefined>('official-access/logout', { method: 'POST' }),
  session: () => apiClient.get<{ session: OfficialSession }>('official-access/session'),
  matches: () => apiClient.get<{ matches: readonly OfficialMatch[] }>('official/matches'),
  fixtureState: (fixtureId: string) =>
    apiClient.get<OfficialMatchState>(`official/matches/fixtures/${fixtureId}`),
  takeFixture: (fixtureId: string, judgeIds: readonly string[]) =>
    apiClient.post(`official/matches/fixtures/${fixtureId}/take`, { judgeIds }),
  state: (matchId: string, options?: { readonly includeVarMonitoring?: boolean }) =>
    apiClient.get<OfficialMatchState>(
      `official/matches/${matchId}${options?.includeVarMonitoring ? '?include=var' : ''}`,
    ),
  take: (matchId: string, judgeIds: readonly string[]) =>
    apiClient.post(`official/matches/${matchId}/take`, { judgeIds }),
  tournamentResults: () =>
    apiClient.get<{ results: readonly AnnounceableTournamentResult[] }>(
      'official/tournament-results',
    ),
  announceTournamentResults: (bracketId: string) =>
    apiClient.post<{ announcement: TournamentResultsAnnouncedPayload }>(
      `official/tournament-results/${encodeURIComponent(bracketId)}/announce`,
      {},
    ),
};
