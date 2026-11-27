import { Compass, Home, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <section className="app-card mx-auto w-full max-w-lg p-8 text-center sm:p-10">
      <Compass aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-4 font-mono text-xs text-muted-foreground">404</p>
      <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        Không tìm thấy trang
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Đường dẫn bạn yêu cầu chưa tồn tại trong phiên bản nền tảng này.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/admin">
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Về trang quản trị
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/">
            <Home aria-hidden="true" className="size-4" />
            Trang chủ
          </Link>
        </Button>
      </div>
    </section>
  );
}
