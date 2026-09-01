import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Không tìm thấy trang</h1>
      <p className="mt-4 text-muted-foreground">
        Đường dẫn bạn yêu cầu chưa tồn tại trong phiên bản nền tảng này.
      </p>
      <Button asChild className="mt-7">
        <Link to="/admin">Về trang quản trị</Link>
      </Button>
    </section>
  );
}
