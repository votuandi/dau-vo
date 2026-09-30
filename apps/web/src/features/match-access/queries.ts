import { queryOptions } from '@tanstack/react-query';
import { officialAccessApi } from '@/services/api/official-access';

// Keep this aligned with the admin monitoring view. The official match-state
// response adds this read-only data only for the assigned supervisor.
export const officialMatchQueryKeys = {
  varMonitoring: (matchId: string) => ['official', 'matches', matchId, 'var'] as const,
};

export function varMonitoringQueryOptions(matchId: string) {
  return queryOptions({
    queryKey: officialMatchQueryKeys.varMonitoring(matchId),
    queryFn: async () => {
      const state = await officialAccessApi.state(matchId, { includeVarMonitoring: true });
      if (!state.varMonitoring) throw new Error('VAR monitoring data was not returned.');
      return state.varMonitoring;
    },
    // The dialog is only available while play is stopped. Fetch its snapshot
    // once per open; closing it drops the cache so the next open reads anew.
    gcTime: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
}
