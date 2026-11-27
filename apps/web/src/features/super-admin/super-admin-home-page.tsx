import { ArrowRight, CreditCard, Layers, Swords, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

const cards = [
  {
    to: '/super-admin/users',
    title: 'Quản lý người dùng',
    description: 'Tra cứu tài khoản, cấp quyền quản trị và điều chỉnh thời hạn sử dụng.',
    icon: Users,
  },
  {
    to: '/super-admin/pricing',
    title: 'Quản lý bảng giá',
    description: 'Cấu hình giá cơ bản, phụ phí thời hạn, số giải và các gói chiết khấu.',
    icon: CreditCard,
  },
  {
    to: '/super-admin/sports',
    title: 'Quản lý môn thể thao',
    description: 'Thêm mới, cập nhật và bật/tắt danh mục môn thể thao của nền tảng.',
    icon: Swords,
  },
  {
    to: '/super-admin/sport-groups',
    title: 'Xem nhóm môn thể thao',
    description: 'Tra cứu các nhóm môn thể thao và bộ luật hệ thống đang áp dụng.',
    icon: Layers,
  },
] as const;

export function SuperAdminHomePage() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Quản trị hệ thống</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Chọn khu vực quản trị để điều phối tài khoản, danh mục môn và chính sách giá.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ to, title, description, icon: Icon }) => (
          <li key={to}>
            <Link
              className="app-card-interactive group flex h-full flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={to}
            >
              <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
              <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground group-hover:text-primary">
                {title}
              </h3>
              <p className="mt-1.5 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Mở
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
