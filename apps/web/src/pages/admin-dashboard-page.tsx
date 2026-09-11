import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { authApi, type AuthenticatedUser } from '@/services/api/auth';
import { subscriptionsApi } from '@/services/api/subscriptions';

export function AdminDashboardPage() {
  const admin = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const entitlementQuery = useQuery({ queryKey: ['subscriptions', 'me'], queryFn: subscriptionsApi.me });
  const isReadOnly = entitlementQuery.data?.accessState === 'EXPIRED_READ_ONLY';

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onMutate: () => {
      setLogoutError(null);
    },
    onSuccess: () => {
      queryClient.setQueryData(authenticatedUserQueryKey, null);
      void navigate('/login', { replace: true });
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
          {isReadOnly ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Quyền quản trị đã hết hạn. Bạn chỉ có thể xem dữ liệu đến {new Date(entitlementQuery.data?.readOnlyUntil ?? '').toLocaleDateString('vi-VN')}. <Link className="font-bold underline" to="/subscriptions">Gia hạn ngay</Link>.</div> : null}
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
