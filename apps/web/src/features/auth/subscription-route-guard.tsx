import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authenticatedUserQueryOptions } from './authenticated-user-session';

export function SubscriptionRouteGuard() {
  const location = useLocation();
  const sessionQuery = useQuery(authenticatedUserQueryOptions);

  if (sessionQuery.isPending) return <p aria-live="polite">Đang kiểm tra phiên đăng nhập…</p>;

  if (!sessionQuery.data) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        to="/login"
      />
    );
  }

  if (sessionQuery.data.user.role === 'SUPER_ADMIN') {
    return <Navigate replace to="/super-admin" />;
  }

  return <Outlet />;
}
