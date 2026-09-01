import { queryOptions } from '@tanstack/react-query';
import { adminAuthApi, type AdminSessionResponse } from '@/services/api/admin-auth';
import { ApiClientError } from '@/services/api/client';

export const adminSessionQueryKey = ['admin', 'session'] as const;

async function loadAdminSession(): Promise<AdminSessionResponse | null> {
  try {
    return await adminAuthApi.me();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export const adminSessionQueryOptions = queryOptions({
  queryKey: adminSessionQueryKey,
  queryFn: loadAdminSession,
  staleTime: 15_000,
});
