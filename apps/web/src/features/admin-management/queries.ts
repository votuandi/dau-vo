import { queryOptions } from '@tanstack/react-query';
import { adminManagementApi } from '@/services/api/admin-management';
import type { AthleteListInput } from '@/services/api/admin-management';

export const tournamentQueryKeys = {
  all: ['admin', 'tournaments'] as const,
  detail: (id: string) => ['admin', 'tournaments', id] as const,
  matches: (id: string) => ['admin', 'tournaments', id, 'matches'] as const,
  units: (id: string) => ['admin', 'tournaments', id, 'units'] as const,
  weightClasses: (id: string) => ['admin', 'tournaments', id, 'weight-classes'] as const,
  athletes: (id: string, filters: AthleteListInput) =>
    ['admin', 'tournaments', id, 'athletes', filters] as const,
};

export const sportQueryKeys = {
  all: ['admin', 'sports'] as const,
};

export const matchQueryKeys = {
  detail: (id: string) => ['admin', 'matches', id] as const,
  monitoring: (id: string) => ['admin', 'matches', id, 'monitoring'] as const,
};

export const tournamentsQueryOptions = queryOptions({
  queryKey: tournamentQueryKeys.all,
  queryFn: adminManagementApi.listTournaments,
});

export const activeSportsQueryOptions = queryOptions({
  queryKey: sportQueryKeys.all,
  queryFn: adminManagementApi.listSports,
});

export function tournamentQueryOptions(id: string) {
  return queryOptions({
    queryKey: tournamentQueryKeys.detail(id),
    queryFn: () => adminManagementApi.getTournament(id),
  });
}

export function tournamentUnitsQueryOptions(id: string) {
  return queryOptions({
    queryKey: tournamentQueryKeys.units(id),
    queryFn: () => adminManagementApi.listUnits(id),
  });
}
export function tournamentWeightClassesQueryOptions(id: string) {
  return queryOptions({
    queryKey: tournamentQueryKeys.weightClasses(id),
    queryFn: () => adminManagementApi.listWeightClasses(id),
  });
}
export function tournamentAthletesQueryOptions(id: string, filters: AthleteListInput) {
  return queryOptions({
    queryKey: tournamentQueryKeys.athletes(id, filters),
    queryFn: () => adminManagementApi.listAthletes(id, filters),
  });
}

export function tournamentMatchesQueryOptions(id: string) {
  return queryOptions({
    queryKey: tournamentQueryKeys.matches(id),
    queryFn: () => adminManagementApi.listMatches(id),
  });
}

export function matchQueryOptions(id: string) {
  return queryOptions({
    queryKey: matchQueryKeys.detail(id),
    queryFn: () => adminManagementApi.getMatch(id),
  });
}

export function matchMonitoringQueryOptions(id: string) {
  return queryOptions({
    queryKey: matchQueryKeys.monitoring(id),
    queryFn: () => adminManagementApi.getMatchMonitoring(id),
    refetchInterval: 1_500,
  });
}
