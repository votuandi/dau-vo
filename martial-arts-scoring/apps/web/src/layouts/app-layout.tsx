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

  if (location.pathname === '/trong-tai') {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="container flex min-h-16 flex-col justify-center gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <NavLink className="flex items-center gap-3" to="/admin">
            <span className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">
              ĐV
            </span>
            <span>
              <span className="block text-sm font-extrabold uppercase tracking-[0.18em]">
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
                    'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isActive && 'bg-slate-950 text-white hover:bg-slate-900 hover:text-white',
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

      <footer className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        Nền tảng chấm điểm võ thuật
      </footer>
    </div>
  );
}
