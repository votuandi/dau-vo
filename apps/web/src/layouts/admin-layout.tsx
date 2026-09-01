import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Gauge, LogOut, Menu, ShieldCheck, Trophy, X } from 'lucide-react';
import { adminApi } from '@/services/api/endpoints';
import { queryKeys } from '@/services/api/query-keys';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const links = [
  { to: '/admin', label: 'Tổng quan', icon: Gauge, end: true },
  { to: '/admin/tournaments', label: 'Giải đấu', icon: Trophy, end: false },
];

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: adminApi.logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: queryKeys.adminMe });
      void navigate('/admin/login', { replace: true });
    },
  });

  const navigation = (
    <>
      <Link className="flex items-center gap-3 px-3 py-5 text-lg font-black tracking-tight" to="/admin">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-slate-950">
          <ShieldCheck className="h-5 w-5" />
        </span>
        ĐẤU VÕ
      </Link>
      <nav className="grid gap-1 px-3">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white',
                isActive && 'bg-white/10 text-white',
              )
            }
            end={end}
            key={to}
            onClick={() => setMobileOpen(false)}
            to={to}
          >
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto p-3">
        <Button
          className="w-full justify-start text-slate-300 hover:bg-white/10 hover:text-white"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
          variant="ghost"
        >
          <LogOut className="h-4 w-4" /> Đăng xuất
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-950 text-white lg:flex">
        {navigation}
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Đóng menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col bg-slate-950 text-white shadow-2xl">
            <Button
              aria-label="Đóng menu"
              className="absolute right-2 top-2 text-white"
              onClick={() => setMobileOpen(false)}
              size="icon"
              variant="ghost"
            >
              <X className="h-5 w-5" />
            </Button>
            {navigation}
          </aside>
        </div>
      ) : null}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center border-b bg-white/95 px-4 backdrop-blur lg:px-8">
          <Button
            aria-label="Mở menu"
            className="mr-3 lg:hidden"
            onClick={() => setMobileOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-muted-foreground">Hệ thống điều hành giải đấu</span>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
