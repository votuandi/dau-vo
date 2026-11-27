import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  LayoutDashboard,
  LogIn,
  LogOut,
  Radio,
  Shield,
  Trophy,
  UserPlus,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
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

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

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
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
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
  const navigationItems: NavItem[] = user
    ? [
        ...(user.role === 'SUPER_ADMIN'
          ? [{ to: '/tournaments', label: 'Giải đấu', icon: Trophy }]
          : []),
        { to: '/account', label: 'Tài khoản', icon: UserRound },
        ...(user.role === 'SUPER_ADMIN'
          ? []
          : [{ to: '/subscription', label: 'Gói đăng ký', icon: CreditCard }]),
        ...(accessState === 'ACTIVE_ADMIN' || accessState === 'EXPIRED_READ_ONLY'
          ? [
              { to: '/admin', label: 'Bảng điều khiển', icon: LayoutDashboard },
              { to: '/admin/tournaments', label: 'Giải đấu quản lý', icon: Trophy },
            ]
          : []),
        ...(user.role === 'SUPER_ADMIN'
          ? [{ to: '/super-admin', label: 'Quản trị hệ thống', icon: Shield }]
          : []),
      ]
    : [
        { to: '/watch', label: 'Theo dõi giải', icon: Radio },
        { to: '/login', label: 'Đăng nhập', icon: LogIn },
        { to: '/register', label: 'Đăng ký', icon: UserPlus },
      ];

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-transparent text-foreground">
      {isAuthPage ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
          <img
            src={`${import.meta.env.BASE_URL}martial-arts-arena.webp`}
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/20 to-slate-950/60" />
        </div>
      ) : null}
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 shadow-sm shadow-blue-950/5 backdrop-blur-xl">
        <div className="container flex min-h-16 flex-col justify-center gap-3 py-2.5 md:flex-row md:items-center md:justify-between">
          <NavLink
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            to="/"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.webp`}
              alt="Logo Chấm Điểm Võ Thuật"
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-lg object-contain"
            />
            <span>
              <span className="block text-sm font-semibold text-foreground">
                Chấm Điểm Võ Thuật
              </span>
              <span className="block text-xs text-muted-foreground">
                Chấm điểm võ thuật thời gian thực
              </span>
            </span>
          </NavLink>

          <nav aria-label="Điều hướng chính" className="flex flex-wrap items-center gap-1">
            {navigationItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-[color,background-color] duration-150 hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive && 'bg-muted text-foreground ring-1 ring-inset ring-foreground/[0.08]',
                  )
                }
                end={to === '/admin' || to === '/login'}
                key={to}
                to={to}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-current opacity-75" />
                {label}
              </NavLink>
            ))}
            {user ? (
              <Button
                className="ml-1"
                disabled={logoutMutation.isPending}
                onClick={() => {
                  logoutMutation.mutate();
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                <LogOut aria-hidden="true" className="size-4 text-muted-foreground" />
                {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </Button>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="container flex flex-1 items-center py-8 md:py-12 [&>*]:min-w-0">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}
