import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/api/endpoints';
import { queryKeys } from '@/services/api/query-keys';
import { ApiClientError } from '@/services/api/client';
import { PageError, PageLoading } from '@/components/page-state';

export function AdminAuthGuard() {
  const location = useLocation();
  const query = useQuery({
    queryKey: queryKeys.adminMe,
    queryFn: ({ signal }) => adminApi.me(signal),
    staleTime: 60_000,
  });

  if (query.isPending) return <PageLoading label="Đang xác minh phiên quản trị…" />;
  if (query.error instanceof ApiClientError && query.error.status === 401) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate replace state={{ returnTo }} to="/admin/login" />;
  }
  if (query.isError) return <PageError onRetry={() => void query.refetch()} />;
  return <Outlet />;
}
