import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { authenticatedUserQueryOptions } from './authenticated-user-session';

export function SuperAdminRouteGuard() {
  const location = useLocation();
  const sessionQuery = useQuery(authenticatedUserQueryOptions);

  if (sessionQuery.isPending) {
    return (
      <section aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-lg text-center">
        <p>Đang kiểm tra quyền quản trị hệ thống…</p>
      </section>
    );
  }

  if (sessionQuery.isError) {
    return (
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight">Không thể kiểm tra phiên đăng nhập</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Máy chủ hiện không phản hồi. Hãy kiểm tra kết nối rồi thử lại.
        </p>
        <Button className="mt-6" onClick={() => void sessionQuery.refetch()} type="button">
          Thử lại
        </Button>
      </section>
    );
  }

  if (!sessionQuery.data) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        to="/login"
      />
    );
  }

  if (sessionQuery.data.user.role !== 'SUPER_ADMIN') {
    return (
      <section className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black tracking-tight">Không có quyền quản trị hệ thống</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Chỉ tài khoản Super Admin mới có thể truy cập khu vực này.
        </p>
      </section>
    );
  }

  return <Outlet context={sessionQuery.data.user} />;
}
