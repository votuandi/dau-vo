import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authenticatedUserQueryOptions } from './authenticated-user-session';

export function AuthenticatedRouteGuard() {
  const location = useLocation();
  const session = useQuery(authenticatedUserQueryOptions);

  if (session.isPending) return <p aria-live="polite">Đang kiểm tra phiên đăng nhập…</p>;
  if (!session.data)
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        to="/login"
      />
    );
  return <Outlet context={session.data.user} />;
}
