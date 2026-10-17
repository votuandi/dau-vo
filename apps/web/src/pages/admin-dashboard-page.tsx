import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CreditCard, LogOut, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { formatDate } from '@/features/admin-management/presentation';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { authApi } from '@/services/api/auth';
import { useAdminAccessContext } from '@/features/auth/admin-access';
import { cn } from '@/lib/utils';
import { DashboardOverview } from '@/features/admin-management/dashboard-overview';
import '@/styles/dashboard.css';

interface QuickLink {
  readonly to: string;
  readonly title: string;
  readonly description: string;
  readonly Icon: LucideIcon;
  readonly featured?: boolean;
}

const quickLinks: readonly QuickLink[] = [
  {
    to: '/admin/tournaments',
    title: 'Quản lý giải đấu',
    description: 'Tạo giải, quản lý hạng cân, vận động viên, nhánh đấu và trọng tài.',
    Icon: Trophy,
    featured: true,
  },
  {
    to: '/subscription',
    title: 'Gói đăng ký',
    description: 'Xem thời hạn quản trị và gia hạn gói đang dùng.',
    Icon: CreditCard,
  },
  {
    to: '/account',
    title: 'Tài khoản',
    description: 'Cập nhật thông tin đăng nhập và bảo mật.',
    Icon: UserRound,
  },
];

export function AdminDashboardPage() {
  const { user: admin, entitlement, isReadOnly } = useAdminAccessContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onMutate: () => {
      setLogoutError(null);
    },
    onSuccess: () => {
      queryClient.setQueryData(authenticatedUserQueryKey, null);
      void navigate('/login', { replace: true });
    },
    onError: () => {
      setLogoutError('Không thể đăng xuất lúc này. Vui lòng thử lại.');
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        actions={
          <Button
            disabled={logoutMutation.isPending}
            onClick={() => {
              logoutMutation.mutate();
            }}
            type="button"
            variant="destructive-gradient"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {logoutMutation.isPending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </Button>
        }
        badge={
          isReadOnly ? (
            <Badge dot tone="warning">
              Chỉ xem
            </Badge>
          ) : (
            <Badge dot tone="success">
              Đã xác thực
            </Badge>
          )
        }
        description={
          <>
            Xin chào, <span className="font-semibold text-foreground">{admin.username}</span>. Theo
            dõi giải đấu và hoạt động thi đấu của bạn tại đây.
            {entitlement?.activeUntil && !isReadOnly ? (
              <> Quyền quản trị có hiệu lực đến {formatDate(entitlement.activeUntil)}.</>
            ) : null}
          </>
        }
        title="Bảng điều khiển"
      />

      {isReadOnly ? (
        <Alert title="Quyền quản trị đã hết hạn" tone="warning">
          <p>
            Thời hạn quản trị đã kết thúc ngày {formatDate(entitlement?.activeUntil ?? null)}. Bạn
            chỉ được xem dữ liệu do mình sở hữu đến {formatDate(entitlement?.readOnlyUntil ?? null)}
            .{' '}
            <Link
              className="font-bold text-primary underline underline-offset-2"
              to="/subscription"
            >
              Gia hạn ngay
            </Link>
          </p>
        </Alert>
      ) : null}

      {logoutError ? (
        <Alert role="alert" tone="error">
          {logoutError}
        </Alert>
      ) : null}

      <DashboardOverview />

      <ul aria-label="Truy cập nhanh" className="grid gap-4 md:grid-cols-3">
        {quickLinks.map(({ to, title, description, Icon, featured }) => (
          <li key={to}>
            <Link
              className={cn(
                'group flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                featured
                  ? 'border-primary/20 bg-gradient-to-br from-primary to-blue-900 text-primary-foreground shadow-primary/20'
                  : 'border-border bg-card hover:border-primary/30',
              )}
              to={to}
            >
              <span
                className={cn(
                  'grid size-12 place-items-center rounded-xl',
                  featured ? 'bg-white/15' : 'bg-primary/10 text-primary',
                )}
              >
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="mt-5 text-lg font-black tracking-tight">{title}</span>
              <span
                className={cn(
                  'mt-1.5 flex-1 text-sm leading-6',
                  featured ? 'text-primary-foreground/85' : 'text-muted-foreground',
                )}
              >
                {description}
              </span>
              <span
                className={cn(
                  'mt-5 inline-flex items-center gap-1.5 text-sm font-bold',
                  featured ? 'text-primary-foreground' : 'text-primary',
                )}
              >
                Mở
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
