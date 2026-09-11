import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { authenticatedUserQueryOptions } from '@/features/auth/authenticated-user-session';
import { getRoleLandingPath } from '@/features/auth/role-aware-routing';

export function RoleAwareIndexRedirect() {
  const sessionQuery = useQuery(authenticatedUserQueryOptions);

  if (sessionQuery.isPending) return <p aria-live="polite">Đang kiểm tra phiên đăng nhập…</p>;
  if (sessionQuery.isError || !sessionQuery.data) return <Navigate replace to="/login" />;
  return <Navigate replace to={getRoleLandingPath(sessionQuery.data.user.role)} />;
}
