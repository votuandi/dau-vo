import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  Layers,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Swords,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { RouteFallback } from '@/components/route-fallback';
import { Button } from '@/components/ui/button';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { cn } from '@/lib/utils';
import { authApi, type AuthenticatedUser } from '@/services/api/auth';

const navigationItems = [
  { to: '/super-admin', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/super-admin/users', label: 'Người dùng', icon: Users },
  { to: '/super-admin/sports', label: 'Môn thể thao', icon: Swords },
  { to: '/super-admin/sport-groups', label: 'Nhóm môn thể thao', icon: Layers },
  { to: '/super-admin/pricing', label: 'Bảng giá', icon: CreditCard },
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
      <div className="app-card p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              Quản trị hệ thống
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Super Admin
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {user.fullName ?? user.username} ·{' '}
              <span className="font-mono text-foreground">{user.username}</span> · {user.role}
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
            <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
            {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </Button>
        </div>
        <nav
          aria-label="Điều hướng quản trị hệ thống"
          className="mt-6 flex flex-wrap gap-1 border-t border-foreground/[0.08] pt-4"
        >
          {navigationItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-[color,background-color] duration-150 hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive &&
                    'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                )
              }
              end={to === '/super-admin'}
              key={to}
              to={to}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="pt-8">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </div>
    </section>
  );
}
