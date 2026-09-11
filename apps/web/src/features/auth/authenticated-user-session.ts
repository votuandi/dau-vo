import { queryOptions } from '@tanstack/react-query';
import { authApi, type AuthResponse } from '@/services/api/auth';
import { ApiClientError } from '@/services/api/client';

export const authenticatedUserQueryKey = ['auth', 'user'] as const;

async function loadAuthenticatedUser(): Promise<AuthResponse | null> {
  try {
    return await authApi.me();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export const authenticatedUserQueryOptions = queryOptions({
  queryKey: authenticatedUserQueryKey,
  queryFn: loadAuthenticatedUser,
  staleTime: 15_000,
});
