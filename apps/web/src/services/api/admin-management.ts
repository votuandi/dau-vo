import {
  type AthleteColor,
  type MatchAccessRole,
  type MatchStatus,
  type TournamentStatus,
} from '@/types/shared';
import type { MatchStatePayload } from '@martial-arts-scoring/shared-types';
import { apiClient } from '@/services/api/client';

export interface AdminTournament {
  readonly id: string;
  readonly imagePath: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: TournamentStatus;
  readonly sportId: string;
  readonly sport: AdminSport;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SportSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly sportGroup: { readonly id: string; readonly code: string; readonly name: string };
}

export type AdminSport = SportSummary;

export interface AdminMatchAthlete {
  readonly id: string;
  readonly name: string;
  readonly organization: string;
  readonly color: AthleteColor;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminMatchAccessCode {
  readonly role: MatchAccessRole;
  readonly updatedAt: string;
}

export interface AdminMatch {
  readonly id: string;
  readonly publicId: string;
  readonly tournamentId: string;
  readonly status: MatchStatus;
  readonly currentRound: number | null;
  readonly roundDurationMs: number;
  readonly breakDurationMs: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly athletes: readonly AdminMatchAthlete[];
  readonly accessCodes: readonly AdminMatchAccessCode[];
}

export interface GeneratedAccessCode {
  readonly role: MatchAccessRole;
  readonly code: string;
}

export interface AdminMatchMonitoring {
  readonly snapshot: MatchStatePayload;
  readonly scoringWindows: readonly {
    id: string;
    roundNumber: number;
    startedAt: string;
    occurredAt: string;
    roundElapsedMs: number | null;
    endsAt: string;
    resolvedAt: string | null;
    invalidatedAt: string | null;
    invalidatedByAuditId: string | null;
    winningColor: AthleteColor | null;
    scoreAwarded: boolean;
    refereeVotes: readonly {
      refereeSlot: string;
      athleteColor: AthleteColor;
      serverReceivedAt: string;
      invalidatedAt: string | null;
    }[];
  }[];
  readonly penalties: readonly {
    id: string;
    roundNumber: number | null;
    value: number;
    createdAt: string;
    revertedAt: string | null;
    revertedByAuditId: string | null;
    athlete: { color: AthleteColor; name: string };
  }[];
  readonly scoreEvents: readonly {
    id: string;
    roundNumber: number | null;
    occurredAt: string;
    roundElapsedMs: number | null;
    type: string;
    value: number;
    createdAt: string;
    revertedAt: string | null;
    revertedByAuditId: string | null;
    scoringWindowId: string | null;
    penaltyId: string | null;
    athlete: { color: AthleteColor | null; name: string | null };
  }[];
  readonly auditLogs: readonly {
    id: string;
    eventType: string;
    metadata: unknown;
    createdAt: string;
  }[];
}

export interface CreateTournamentInput {
  readonly sportId: string;
  readonly name: string;
  readonly description?: string;
  readonly location?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly status?: TournamentStatus;
}

export interface UpdateTournamentInput {
  readonly sportId?: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly status?: TournamentStatus;
}

export interface MatchAthleteInput {
  readonly color: AthleteColor;
  readonly name: string;
  readonly organization: string;
}

export interface CreateMatchInput {
  readonly athletes: readonly [MatchAthleteInput, MatchAthleteInput];
}

export interface UpdateMatchInput {
  readonly roundDurationMs?: number;
  readonly breakDurationMs?: number;
  readonly athletes?: readonly [MatchAthleteInput, MatchAthleteInput];
}

interface TournamentsResponse {
  readonly tournaments: readonly AdminTournament[];
}

interface TournamentResponse {
  readonly tournament: AdminTournament;
}

interface MatchesResponse {
  readonly matches: readonly AdminMatch[];
}

interface MatchResponse {
  readonly match: AdminMatch;
}

export interface MatchWithGeneratedCodesResponse extends MatchResponse {
  readonly accessCodes: readonly GeneratedAccessCode[];
}

export interface GeneratedCodesResponse {
  readonly matchId: string;
  readonly accessCodes: readonly GeneratedAccessCode[];
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export const adminManagementApi = {
  listSports: () => apiClient.get<readonly SportSummary[]>('admin/sports'),
  listTournaments: () => apiClient.get<TournamentsResponse>('admin/tournaments'),
  createTournament: (input: CreateTournamentInput) =>
    apiClient.post<TournamentResponse>('admin/tournaments', input),
  getTournament: (id: string) =>
    apiClient.get<TournamentResponse>(`admin/tournaments/${encodePathSegment(id)}`),
  updateTournament: (id: string, input: UpdateTournamentInput) =>
    apiClient.patch<TournamentResponse>(`admin/tournaments/${encodePathSegment(id)}`, input),
  replaceTournamentImage: (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiClient.put<{ imagePath: string }>(
      `admin/tournaments/${encodePathSegment(id)}/image`,
      body,
    );
  },
  removeTournamentImage: (id: string) =>
    apiClient.delete<undefined>(`admin/tournaments/${encodePathSegment(id)}/image`),
  archiveTournament: (id: string) =>
    apiClient.delete<TournamentResponse>(`admin/tournaments/${encodePathSegment(id)}`),
  listMatches: (tournamentId: string) =>
    apiClient.get<MatchesResponse>(`admin/tournaments/${encodePathSegment(tournamentId)}/matches`),
  createMatch: (tournamentId: string, input: CreateMatchInput) =>
    apiClient.post<MatchWithGeneratedCodesResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/matches`,
      input,
    ),
  getMatch: (id: string) => apiClient.get<MatchResponse>(`admin/matches/${encodePathSegment(id)}`),
  getMatchMonitoring: (id: string) =>
    apiClient.get<AdminMatchMonitoring>(`admin/matches/${encodePathSegment(id)}/monitoring`),
  updateMatch: (id: string, input: UpdateMatchInput) =>
    apiClient.patch<MatchResponse>(`admin/matches/${encodePathSegment(id)}`, input),
  regenerateAllMatchCodes: (id: string) =>
    apiClient.post<GeneratedCodesResponse>(
      `admin/matches/${encodePathSegment(id)}/access-codes/regenerate`,
      {},
    ),
  regenerateMatchCode: (id: string, role: MatchAccessRole) =>
    apiClient.post<GeneratedCodesResponse>(
      `admin/matches/${encodePathSegment(id)}/access-codes/${encodePathSegment(role)}/regenerate`,
      {},
    ),
};
