import { apiClient } from './client';

export interface PublicTournament {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: 'ACTIVE' | 'FINISHED';
  readonly sport: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly sportGroup: { readonly id: string; readonly code: string; readonly name: string };
  };
}
export interface PublicMatch {
  readonly id: string;
  readonly publicId: string;
  readonly status: string;
  readonly currentRound: number;
  readonly athletes: readonly {
    readonly name: string;
    readonly organization: string | null;
    readonly color: string;
  }[];
}
export interface PublicTournamentDetail extends PublicTournament {
  readonly matches: readonly PublicMatch[];
}

export const publicViewApi = {
  tournaments: () =>
    apiClient.get<{
      items: readonly PublicTournament[];
      page: number;
      pageSize: number;
      total: number;
    }>('tournaments'),
  tournament: (id: string) =>
    apiClient.get<{ tournament: PublicTournamentDetail }>(`tournaments/${encodeURIComponent(id)}`),
  match: (id: string) =>
    apiClient.get<{
      match: PublicMatch & {
        readonly tournament: Pick<PublicTournament, 'id' | 'name' | 'status'>;
      };
    }>(`matches/${encodeURIComponent(id)}`),
};
