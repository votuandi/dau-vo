import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { adminSessionQueryOptions } from '@/features/admin-auth/admin-session';

export function AdminRouteGuard() {
  const location = useLocation();
  const sessionQuery = useQuery(adminSessionQueryOptions);

  if (sessionQuery.isPending) {
    return (
      <section
        aria-busy="true"
        aria-live="polite"
        className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
      >
        <div className="mx-auto size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Đang kiểm tra phiên đăng nhập…</p>
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
    const returnPath = `${location.pathname}${location.search}${location.hash}`;

    return <Navigate replace state={{ from: returnPath }} to="/admin/login" />;
  }

  return <Outlet context={sessionQuery.data.admin} />;
}
