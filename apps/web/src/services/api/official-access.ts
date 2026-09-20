import { apiClient, request } from '@/services/api/client';
import type { MatchLifecycle, TournamentOfficialRole } from '@/types/shared';

export interface OfficialAssignment {
  readonly id: string;
  readonly role: TournamentOfficialRole;
  readonly refereePosition: number | null;
  readonly match: { readonly id: string; readonly publicId: string; readonly status: string };
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
  readonly status: string;
  readonly requiredRefereeCount: number;
  readonly athletes: readonly { readonly color: string; readonly name: string }[];
  readonly claimable: boolean;
}
export interface OfficialReferee {
  readonly id: string;
  readonly name: string;
  readonly status: 'READY' | 'IN_MATCH' | 'DISABLED';
  readonly assignedMatchId: string | null;
}

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
  state: (matchId: string) =>
    apiClient.get<{
      match: {
        id: string;
        lifecycle: MatchLifecycle;
        requiredRefereeCount: number;
        officialAssignments: readonly {
          officialId: string;
          role: TournamentOfficialRole;
          refereePosition: number | null;
          official: { name: string; isActive: boolean };
        }[];
      };
      referees: readonly OfficialReferee[];
    }>(`official/matches/${matchId}`),
  take: (matchId: string, refereeIds: readonly string[]) =>
    apiClient.post(`official/matches/${matchId}/take`, { refereeIds }),
};
