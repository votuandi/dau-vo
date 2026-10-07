import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { RouteFallback } from '@/components/route-fallback';
import { SiteFooter } from '@/components/site-footer';
import { updatePageMetadata } from '@/features/seo/metadata';
import { Button } from '@/components/ui/button';
import {
  authenticatedUserQueryKey,
  authenticatedUserQueryOptions,
} from '@/features/auth/authenticated-user-session';
import { effectiveAdminAccessState, entitlementQueryOptions } from '@/features/auth/admin-access';
import { cn } from '@/lib/utils';
import { authApi } from '@/services/api/auth';

export function AppLayout() {
  const location = useLocation();
  useEffect(() => {
    updatePageMetadata(location.pathname);
  }, [location.pathname]);

  // The prerendered homepage is hydrated, so it must render without a Suspense
  // boundary to match the server markup; it is never lazy-loaded.
  if (location.pathname === '/') return <Outlet />;

  if (
    location.pathname === '/trong-tai' ||
    location.pathname === '/giam-dinh' ||
    location.pathname === '/giam-sat' ||
    location.pathname.startsWith('/bang-diem')
  ) {
    return (
      <Suspense
        fallback={
          <RouteFallback tone={location.pathname.startsWith('/bang-diem') ? 'dark' : 'light'} />
        }
      >
        <Outlet />
      </Suspense>
    );
  }

  return <StandardAppLayout />;
}

function StandardAppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(authenticatedUserQueryOptions);
  const user = sessionQuery.data?.user;
  const entitlementQuery = useQuery({ ...entitlementQueryOptions, enabled: Boolean(user) });
  const accessState =
    user && entitlementQuery.isSuccess
      ? effectiveAdminAccessState(user, entitlementQuery.data)
      : undefined;
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.setQueryData(authenticatedUserQueryKey, null);
      void navigate('/login', { replace: true });
    },
  });
  const navigationItems = user
    ? [
        ...(user.role === 'SUPER_ADMIN' ? [{ to: '/tournaments', label: 'Giải đấu' }] : []),
        { to: '/account', label: 'Tài khoản' },
        ...(user.role === 'SUPER_ADMIN' ? [] : [{ to: '/subscription', label: 'Gói đăng ký' }]),
        ...(accessState === 'ACTIVE_ADMIN' || accessState === 'EXPIRED_READ_ONLY'
          ? [
              { to: '/admin', label: 'Bảng điều khiển' },
              { to: '/admin/tournaments', label: 'Giải đấu quản lý' },
            ]
          : []),
        ...(user.role === 'SUPER_ADMIN'
          ? [{ to: '/super-admin', label: 'Quản trị hệ thống' }]
          : []),
      ]
    : [
        { to: '/login', label: 'Đăng nhập' },
        { to: '/register', label: 'Đăng ký' },
      ];

  return (
    <div className="flex min-h-dvh flex-col bg-transparent text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 shadow-sm shadow-blue-950/5 backdrop-blur-xl">
        <div className="container flex min-h-16 flex-col justify-center gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <NavLink className="flex items-center gap-3" to="/">
            <img
              src={`${import.meta.env.BASE_URL}logo.webp`}
              alt="Logo Đấu Võ Minwy"
              width={48}
              height={48}
              className="size-12 shrink-0 object-contain"
            />
            <span>
              <span className="block text-sm font-extrabold uppercase tracking-[0.18em] text-primary">
                Đấu Võ
              </span>
              <span className="block text-xs text-muted-foreground">Chấm điểm võ thuật</span>
            </span>
          </NavLink>

          <nav aria-label="Điều hướng chính" className="flex flex-wrap gap-1">
            {navigationItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-all hover:bg-white/80 hover:text-primary',
                    isActive &&
                      'bg-gradient-to-r from-sky-700 to-blue-800 text-white shadow-md shadow-sky-700/20 ring-1 ring-red-500/20 hover:text-white',
                  )
                }
                end={item.to === '/admin' || item.to === '/login'}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
            {user ? (
              <Button
                disabled={logoutMutation.isPending}
                onClick={() => {
                  logoutMutation.mutate();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </Button>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="container flex flex-1 items-center py-10 md:py-16 [&>*]:min-w-0">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}
