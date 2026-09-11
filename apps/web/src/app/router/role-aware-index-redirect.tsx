import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { authenticatedUserQueryOptions } from '@/features/auth/authenticated-user-session';
import { getAccessLandingPath } from '@/features/auth/role-aware-routing';
import { effectiveAdminAccessState, entitlementQueryOptions } from '@/features/auth/admin-access';

export function RoleAwareIndexRedirect() {
  const sessionQuery = useQuery(authenticatedUserQueryOptions);
  const entitlementQuery = useQuery({
    ...entitlementQueryOptions,
    enabled: Boolean(sessionQuery.data),
  });

  if (sessionQuery.isPending) return <p aria-live="polite">Đang kiểm tra phiên đăng nhập…</p>;
  if (sessionQuery.isError || !sessionQuery.data) return <Navigate replace to="/login" />;
  if (entitlementQuery.isPending) return <p aria-live="polite">Đang kiểm tra quyền truy cập…</p>;
  if (entitlementQuery.isError)
    return <p role="alert">Không thể kiểm tra quyền truy cập. Vui lòng thử lại.</p>;
  return (
    <Navigate
      replace
      to={getAccessLandingPath(
        effectiveAdminAccessState(sessionQuery.data.user, entitlementQuery.data),
      )}
    />
  );
}
