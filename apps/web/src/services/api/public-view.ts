import { apiClient } from './client';
import type {
  MatchDisplayState,
  MatchLifecycle,
  MatchPhase,
} from '@martial-arts-scoring/shared-types';

export interface PublicTournament {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: 'ACTIVE' | 'FINISHED';
  readonly imageUrl: string | null;
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
  readonly phase: MatchPhase;
  readonly lifecycle: MatchLifecycle;
  readonly displayState: MatchDisplayState;
  readonly currentRound: number;
  readonly weightClass: { readonly name: string } | null;
  readonly athletes: readonly {
    readonly name: string;
    readonly organization: string | null;
    readonly color: string;
    readonly imageUrl: string | null;
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
