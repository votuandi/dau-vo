import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navigationItems = [
  { to: '/admin/login', label: 'Đăng nhập' },
  { to: '/admin', label: 'Quản trị' },
  { to: '/admin/tournaments', label: 'Giải đấu' },
  { to: '/trong-tai', label: 'Trọng tài' },
  { to: '/giam-dinh', label: 'Giám định' },
  { to: '/bang-diem', label: 'Bảng điểm' },
] as const;

export function AppLayout() {
  const location = useLocation();

  if (
    location.pathname === '/trong-tai' ||
    location.pathname === '/giam-dinh' ||
    location.pathname.startsWith('/bang-diem')
  ) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-transparent text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 shadow-sm shadow-blue-950/5 backdrop-blur-xl">
        <div className="container flex min-h-16 flex-col justify-center gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <NavLink className="flex items-center gap-3" to="/admin">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-sky-700 via-blue-800 to-red-700 text-sm font-black text-white shadow-lg shadow-sky-700/25 ring-1 ring-white/70">
              ĐV
            </span>
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
                end={item.to === '/admin' || item.to === '/admin/login'}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="container flex flex-1 items-center py-10 md:py-16">
        <Outlet />
      </main>

      <footer className="border-t border-white/70 bg-white/40 py-5 text-center text-xs text-muted-foreground backdrop-blur">
        Nền tảng chấm điểm võ thuật
      </footer>
    </div>
  );
}
