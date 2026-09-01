import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { adminSessionQueryKey } from '@/features/admin-auth/admin-session';
import { adminAuthApi, type AdminIdentity } from '@/services/api/admin-auth';

export function AdminDashboardPage() {
  const admin = useOutletContext<AdminIdentity>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const logoutMutation = useMutation({
    mutationFn: adminAuthApi.logout,
    onMutate: () => {
      setLogoutError(null);
    },
    onSuccess: () => {
      queryClient.setQueryData(adminSessionQueryKey, null);
      void navigate('/admin/login', { replace: true });
    },
    onError: () => {
      setLogoutError('Không thể đăng xuất lúc này. Vui lòng thử lại.');
    },
  });

  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-8 shadow-sm md:p-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800">
            Đã xác thực
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">
            Bảng điều khiển quản trị
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Xin chào, <span className="font-semibold text-foreground">{admin.username}</span>. Nền
            tảng quản trị đã sẵn sàng để quản lý giải đấu và trận đấu.
          </p>
          <Button asChild className="mt-6" size="lg">
            <Link to="/admin/tournaments">Quản lý giải đấu</Link>
          </Button>
        </div>

        <Button
          disabled={logoutMutation.isPending}
          onClick={() => {
            logoutMutation.mutate();
          }}
          type="button"
          variant="outline"
        >
          {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
      </div>

      {logoutError ? (
        <div
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {logoutError}
        </div>
      ) : null}
    </section>
  );
}
