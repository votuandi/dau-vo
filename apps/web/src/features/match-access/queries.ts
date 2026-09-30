import { queryOptions } from '@tanstack/react-query';
import { officialAccessApi } from '@/services/api/official-access';

// Keep this aligned with the admin monitoring view. The official endpoint is
// intentionally separate because it is authorized by the supervisor session.
export const officialMatchQueryKeys = {
  varMonitoring: (matchId: string) => ['official', 'matches', matchId, 'var-monitoring'] as const,
};

export function varMonitoringQueryOptions(matchId: string) {
  return queryOptions({
    queryKey: officialMatchQueryKeys.varMonitoring(matchId),
    queryFn: () => officialAccessApi.varMonitoring(matchId),
    refetchInterval: 1_500,
  });
}
