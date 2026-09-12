import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { cn } from '@/lib/utils';
import { authApi, type AuthenticatedUser } from '@/services/api/auth';

const navigationItems = [
  { to: '/super-admin', label: 'Tổng quan' },
  { to: '/super-admin/users', label: 'Người dùng' },
  { to: '/super-admin/sports', label: 'Môn thể thao' },
  { to: '/super-admin/sport-groups', label: 'Nhóm môn thể thao' },
  { to: '/super-admin/pricing', label: 'Bảng giá' },
] as const;

export function SuperAdminLayout() {
  const user = useOutletContext<AuthenticatedUser>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(authenticatedUserQueryKey, null);
      void navigate('/login', { replace: true });
    },
  });

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Quản trị hệ thống
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Super Admin</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {user.fullName ?? user.username} · {user.username} · {user.role}
            </p>
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
        <nav aria-label="Điều hướng quản trị hệ thống" className="mt-6 flex flex-wrap gap-2">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-primary',
                  isActive && 'bg-primary text-primary-foreground hover:text-primary-foreground',
                )
              }
              end={item.to === '/super-admin'}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="pt-8">
        <Outlet />
      </div>
    </section>
  );
}
