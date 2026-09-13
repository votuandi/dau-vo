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
  readonly athleteId: string | null;
  readonly name: string;
  readonly organization: string | null;
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
  readonly weightClassId: string | null;
  readonly bracketFixtureId: string | null;
  readonly weightClass: {
    readonly id: string;
    readonly name: string;
    readonly isActive: boolean;
  } | null;
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
  readonly athleteId: string;
}

export interface CreateMatchInput {
  readonly athletes: readonly [MatchAthleteInput, MatchAthleteInput];
}

export interface UpdateMatchInput {
  readonly roundDurationMs?: number;
  readonly breakDurationMs?: number;
  readonly athletes?: readonly [MatchAthleteInput, MatchAthleteInput];
}

export interface TournamentRosterItem {
  readonly id: string;
  readonly tournamentId: string;
  readonly name: string;
  readonly details: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface TournamentWeightClass extends TournamentRosterItem {
  readonly hasCurrentBracket: boolean;
}
export interface TournamentOrganization extends TournamentRosterItem {
  readonly location: string | null;
  readonly imagePath: string | null;
  readonly imageUrl?: string | null;
}
export interface TournamentAthlete {
  readonly id: string;
  readonly tournamentId: string;
  readonly name: string;
  readonly birthYear: number;
  readonly details: string | null;
  readonly imagePath: string | null;
  readonly imageUrl: string | null;
  readonly isActive: boolean;
  readonly organizationId: string | null;
  readonly weightClassId: string;
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly isActive: boolean;
  } | null;
  readonly weightClass: { readonly id: string; readonly name: string; readonly isActive: boolean };
}
export interface RosterItemInput {
  readonly name?: string;
  readonly location?: string | null;
  readonly details?: string | null;
  readonly isActive?: boolean;
}
export interface CreateAthleteInput {
  readonly name: string;
  readonly birthYear: number;
  readonly weightClassId: string;
  readonly organizationId?: string | null;
  readonly details?: string | null;
  readonly isActive?: boolean;
}
export interface UpdateAthleteInput {
  readonly name?: string;
  readonly birthYear?: number;
  readonly weightClassId?: string;
  readonly organizationId?: string | null;
  readonly details?: string | null;
  readonly isActive?: boolean;
}
export interface AthleteListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly weightClassId?: string;
  readonly organizationId?: string;
  readonly noOrganization?: boolean;
  readonly isActive?: boolean;
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
interface OrganizationsResponse {
  readonly organizations: readonly TournamentOrganization[];
}
interface WeightClassesResponse {
  readonly weightClasses: readonly TournamentWeightClass[];
}
interface AthleteResponse {
  readonly athlete: TournamentAthlete;
}
interface AthletesResponse {
  readonly items: readonly TournamentAthlete[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface MatchWithGeneratedCodesResponse extends MatchResponse {
  readonly accessCodes: readonly GeneratedAccessCode[];
}

export interface GeneratedCodesResponse {
  readonly matchId: string;
  readonly accessCodes: readonly GeneratedAccessCode[];
}

export interface BracketPreview {
  readonly previewToken: string;
  readonly expiresAt: string;
  readonly summary: {
    readonly athleteCount: number;
    readonly bracketSize: number;
    readonly byeCount: number;
    readonly roundCount: number;
    readonly totalFixtureCount: number;
  };
  readonly initialEntrants: readonly {
    readonly drawPosition: number;
    readonly athleteId: string | null;
    readonly athlete: {
      readonly id: string;
      readonly name: string;
      readonly organizationName: string | null;
      readonly imageUrl: string | null;
    } | null;
    readonly isBye: boolean;
  }[];
  readonly rounds: readonly {
    readonly roundNumber: number;
    readonly label: string;
    readonly fixtures: readonly BracketFixture[];
  }[];
}
export interface BracketDrawSetup {
  readonly setupToken: string;
  readonly expiresAt: string;
  readonly summary: BracketPreview['summary'];
  readonly eligibleAthletes: readonly {
    readonly id: string;
    readonly name: string;
    readonly organizationName: string | null;
    readonly imageUrl: string | null;
  }[];
}
export interface BracketFixture {
  readonly id: string;
  readonly displayReference: string;
  readonly position: number;
  readonly slots: readonly {
    readonly side: 'RED' | 'BLUE';
    readonly source: {
      readonly kind: 'ENTRANT' | 'FIXTURE_WINNER';
      readonly entrantId?: string;
      readonly fixtureId?: string;
    };
    readonly resolvedEntrantId: string | null;
  }[];
}
export interface ActiveBracket {
  readonly bracket: {
    readonly id: string;
    readonly status: string;
    readonly athleteCount: number;
    readonly bracketSize: number;
    readonly roundCount: number;
    readonly confirmedAt: string;
    readonly championEntrant: { readonly id: string; readonly snapshotName: string } | null;
  };
  readonly entrants: readonly {
    readonly id: string;
    readonly athleteId: string | null;
    readonly snapshotName: string;
    readonly snapshotOrganization: string | null;
    readonly snapshotImagePath: string | null;
  }[];
  readonly fixtures: readonly {
    readonly id: string;
    readonly displayReference: string;
    readonly roundNumber: number;
    readonly position: number;
    readonly status: string;
    readonly match: { readonly id: string; readonly publicId: string } | null;
    readonly winnerEntrant: { readonly id: string; readonly snapshotName: string } | null;
    readonly slots: readonly {
      readonly side: 'RED' | 'BLUE';
      readonly resolvedEntrant: {
        readonly id: string;
        readonly snapshotName: string;
        readonly snapshotOrganization: string | null;
        readonly snapshotImagePath: string | null;
      } | null;
      readonly directEntrant: {
        readonly id: string;
        readonly snapshotName: string;
        readonly snapshotOrganization: string | null;
        readonly snapshotImagePath: string | null;
      } | null;
      readonly sourceFixtureId: string | null;
    }[];
  }[];
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
  listMatches: (
    tournamentId: string,
    filters: { readonly weightClassId?: string; readonly unassigned?: true } = {},
  ) => {
    const params = new URLSearchParams();
    if (filters.weightClassId) params.set('weightClassId', filters.weightClassId);
    if (filters.unassigned) params.set('unassigned', 'true');
    const suffix = params.size ? `?${params.toString()}` : '';
    return apiClient.get<MatchesResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/matches${suffix}`,
    );
  },
  countMatches: (tournamentId: string) =>
    apiClient.get<{
      readonly counts: readonly { readonly weightClassId: string | null; readonly count: number }[];
    }>(`admin/tournaments/${encodePathSegment(tournamentId)}/matches/counts`),
  createMatch: (tournamentId: string, input: CreateMatchInput) =>
    apiClient.post<MatchWithGeneratedCodesResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/matches`,
      input,
    ),
  getBracketDrawSetup: (tournamentId: string, weightClassId: string) =>
    apiClient.get<BracketDrawSetup>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(weightClassId)}/bracket/draw-setup`,
    ),
  previewBracket: (
    tournamentId: string,
    weightClassId: string,
    input: { readonly setupToken: string; readonly designatedByeAthleteIds: readonly string[] },
  ) =>
    apiClient.post<BracketPreview>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(weightClassId)}/bracket/preview`,
      input,
    ),
  confirmBracket: (
    tournamentId: string,
    weightClassId: string,
    input: { readonly previewToken: string; readonly idempotencyKey: string },
  ) =>
    apiClient.post<ActiveBracket>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(weightClassId)}/bracket/confirm`,
      input,
    ),
  getBracket: (tournamentId: string, weightClassId: string) =>
    apiClient.get<ActiveBracket>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(weightClassId)}/bracket`,
    ),
  cancelBracket: (tournamentId: string, weightClassId: string, reason: string) =>
    apiClient.post<{ readonly bracket: { readonly id: string; readonly status: 'CANCELLED' } }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(weightClassId)}/bracket/cancel`,
      { reason },
    ),
  prepareBracketFixtureMatch: (tournamentId: string, bracketId: string, fixtureId: string) =>
    apiClient.post<MatchWithGeneratedCodesResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/brackets/${encodePathSegment(bracketId)}/fixtures/${encodePathSegment(fixtureId)}/prepare-match`,
      {},
    ),
  decideBracketFixtureWinner: (
    tournamentId: string,
    bracketId: string,
    fixtureId: string,
    input: { readonly entrantId: string; readonly reason: string; readonly idempotencyKey: string },
  ) =>
    apiClient.post<{ readonly fixtureId: string; readonly winnerEntrantId: string }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/brackets/${encodePathSegment(bracketId)}/fixtures/${encodePathSegment(fixtureId)}/decide-winner`,
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
  listOrganizations: (tournamentId: string, includeInactive = true) =>
    apiClient.get<OrganizationsResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/organizations?includeInactive=${String(includeInactive)}`,
    ),
  createOrganization: (tournamentId: string, input: RosterItemInput) =>
    apiClient.post<{ readonly organization: TournamentOrganization }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/organizations`,
      input,
    ),
  updateOrganization: (tournamentId: string, id: string, input: RosterItemInput) =>
    apiClient.patch<{ readonly organization: TournamentOrganization }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/organizations/${encodePathSegment(id)}`,
      input,
    ),
  deleteOrganization: (tournamentId: string, id: string) =>
    apiClient.delete<{ readonly organization: TournamentOrganization }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/organizations/${encodePathSegment(id)}`,
    ),
  replaceOrganizationImage: (tournamentId: string, id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiClient.put<{ readonly imagePath: string; readonly imageUrl: string }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/organizations/${encodePathSegment(id)}/image`,
      body,
    );
  },
  removeOrganizationImage: (tournamentId: string, id: string) =>
    apiClient.delete<undefined>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/organizations/${encodePathSegment(id)}/image`,
    ),
  listWeightClasses: (tournamentId: string, includeInactive = true) =>
    apiClient.get<WeightClassesResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes?includeInactive=${String(includeInactive)}`,
    ),
  createWeightClass: (tournamentId: string, input: RosterItemInput) =>
    apiClient.post<{ readonly weightClass: TournamentRosterItem }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes`,
      input,
    ),
  updateWeightClass: (tournamentId: string, id: string, input: RosterItemInput) =>
    apiClient.patch<{ readonly weightClass: TournamentRosterItem }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(id)}`,
      input,
    ),
  deleteWeightClass: (tournamentId: string, id: string) =>
    apiClient.delete<{ readonly weightClass: TournamentRosterItem }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/weight-classes/${encodePathSegment(id)}`,
    ),
  listAthletes: (tournamentId: string, input: AthleteListInput) => {
    const q = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== '') q.set(key, String(value));
    });
    return apiClient.get<AthletesResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/athletes?${q.toString()}`,
    );
  },
  createAthlete: (tournamentId: string, input: CreateAthleteInput) =>
    apiClient.post<AthleteResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/athletes`,
      input,
    ),
  updateAthlete: (tournamentId: string, id: string, input: UpdateAthleteInput) =>
    apiClient.patch<AthleteResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/athletes/${encodePathSegment(id)}`,
      input,
    ),
  deleteAthlete: (tournamentId: string, id: string) =>
    apiClient.delete<AthleteResponse>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/athletes/${encodePathSegment(id)}`,
    ),
  replaceAthleteImage: (tournamentId: string, id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return apiClient.put<{ readonly imagePath: string; readonly imageUrl: string }>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/athletes/${encodePathSegment(id)}/image`,
      body,
    );
  },
  removeAthleteImage: (tournamentId: string, id: string) =>
    apiClient.delete<undefined>(
      `admin/tournaments/${encodePathSegment(tournamentId)}/athletes/${encodePathSegment(id)}/image`,
    ),
};
