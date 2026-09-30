import { apiClient, request } from '@/services/api/client';
import { MatchLifecycle, MatchStatus, type TournamentOfficialRole } from '@/types/shared';
import type { AdminMatchMonitoring } from './admin-management';

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
  readonly publicId: string;
  readonly lifecycle: MatchLifecycle;
  readonly status: MatchStatus;
  readonly requiredJudgeCount: number;
  readonly athletes: readonly { readonly color: string; readonly name: string }[];
  readonly claimable: boolean;
}
export interface OfficialReferee {
  readonly id: string;
  readonly name: string;
  readonly status: 'READY' | 'IN_MATCH' | 'DISABLED';
  readonly assignedMatchId: string | null;
}

// The supervisor endpoint deliberately exposes only these read-only histories,
// but their item shapes are the same read model used by admin monitoring.
export type VarMonitoring = Pick<
  AdminMatchMonitoring,
  'scoringWindows' | 'penalties' | 'scoreEvents' | 'auditLogs'
>;

export const officialAccessApi = {
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
  state: (matchId: string, options?: { readonly includeVarMonitoring?: boolean }) =>
    apiClient.get<{
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
    }>(`official/matches/${matchId}${options?.includeVarMonitoring ? '?include=var' : ''}`),
  take: (matchId: string, judgeIds: readonly string[]) =>
    apiClient.post(`official/matches/${matchId}/take`, { judgeIds }),
};
