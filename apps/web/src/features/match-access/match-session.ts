import { queryOptions } from '@tanstack/react-query';
import { matchAccessApi, type MatchAccessSessionResponse } from '@/services/api/match-access';
import { ApiClientError } from '@/services/api/client';
import { MatchRole } from '@/types/shared';

export const matchAccessSessionQueryKey = ['match-access', 'session'] as const;

async function loadMatchAccessSession(): Promise<MatchAccessSessionResponse | null> {
  try {
    return await matchAccessApi.session();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export const matchAccessSessionQueryOptions = queryOptions({
  queryKey: matchAccessSessionQueryKey,
  queryFn: loadMatchAccessSession,
  refetchOnMount: 'always',
  retry: false,
  staleTime: 0,
});

export function getMatchAccessPath(role: MatchRole): '/trong-tai' | '/giam-dinh' {
  return role === MatchRole.REFEREE ? '/trong-tai' : '/giam-dinh';
}
