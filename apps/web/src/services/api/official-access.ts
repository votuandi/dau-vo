import { apiClient, request } from '@/services/api/client';
import type { TournamentOfficialRole } from '@/types/shared';

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
  readonly status: string;
  readonly requiredRefereeCount: number;
  readonly athletes: readonly { readonly color: string; readonly name: string }[];
  readonly claimable: boolean;
}
export interface OfficialReferee {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
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
  claim: (matchId: string) => apiClient.post(`official/matches/${matchId}/claim`, {}),
  confirm: (matchId: string, refereeIds: readonly string[]) =>
    apiClient.post(`official/matches/${matchId}/referees`, { refereeIds }),
  release: (matchId: string) => apiClient.delete(`official/matches/${matchId}/claim`),
};
