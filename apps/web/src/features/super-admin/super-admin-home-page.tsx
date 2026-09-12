import { Link } from 'react-router-dom';

export function SuperAdminHomePage() {
  return (
    <section>
      <h2 className="text-3xl font-black">Quản trị hệ thống</h2>
      <p className="mt-3 text-muted-foreground">
        <Link className="text-primary underline" to="/super-admin/users">
          Quản lý người dùng
        </Link>{' '}
        ·{' '}
        <Link className="text-primary underline" to="/super-admin/pricing">
          Quản lý bảng giá
        </Link>{' '}
        ·{' '}
        <Link className="text-primary underline" to="/super-admin/sports">
          Quản lý môn thể thao
        </Link>{' '}
        ·{' '}
        <Link className="text-primary underline" to="/super-admin/sport-groups">
          Xem nhóm môn thể thao
        </Link>
      </p>
    </section>
  );
}
