import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CalendarPlus, CreditCard, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { selectClassName } from '@/features/admin-management/presentation';
import { subscriptionsApi } from '@/services/api/subscriptions';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { entitlementQueryKey } from '@/features/auth/admin-access';
import { createUuid } from '@/lib/uuid';

export function SubscriptionPage() {
  const [durationBundle, setDuration] = useState<number>();
  const [tournamentBundle, setTournament] = useState<number>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const quote = useQuery({
    queryKey: ['subscription', 'quote', durationBundle, tournamentBundle],
    queryFn: () => subscriptionsApi.quote({ durationBundle, tournamentBundle }),
  });
  const entitlement = useQuery({ queryKey: ['subscription', 'me'], queryFn: subscriptionsApi.me });
  const activate = useMutation({
    mutationFn: () =>
      subscriptionsApi.activate({
        durationBundle,
        tournamentBundle,
        idempotencyKey: createUuid(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authenticatedUserQueryKey }),
        queryClient.invalidateQueries({ queryKey: entitlementQueryKey }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: authenticatedUserQueryKey }),
        queryClient.refetchQueries({ queryKey: entitlementQueryKey }),
      ]);
      void navigate('/');
    },
  });
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gói quản trị</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Kích hoạt mô phỏng MVP — không phải thanh toán bên ngoài.
          </p>
        </div>
        {entitlement.data ? (
          <div className="app-card px-4 py-2.5">
            <p className="text-xs text-muted-foreground">Hạn mức hiện tại</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              Còn {entitlement.data.remainingTournamentQuota}/{entitlement.data.tournamentLimit}{' '}
              giải.
            </p>
          </div>
        ) : null}
      </div>

      <div className="app-card p-6 sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">Tùy chọn mở rộng gói</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn thêm thời hạn quản trị hoặc số lượng giải đấu phù hợp với kế hoạch tổ chức.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="form-field rounded-xl border border-foreground/[0.08] bg-muted/40 p-4">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarPlus aria-hidden="true" className="size-4 text-muted-foreground" />
              Thêm tháng
            </span>
            <select
              className={selectClassName}
              onChange={(event) => {
                setDuration(event.target.value ? Number(event.target.value) : undefined);
              }}
              value={durationBundle ?? ''}
            >
              <option value="">Không</option>
              <option value="6">6 tháng</option>
              <option value="12">12 tháng</option>
            </select>
          </label>

          <label className="form-field rounded-xl border border-foreground/[0.08] bg-muted/40 p-4">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Trophy aria-hidden="true" className="size-4 text-muted-foreground" />
              Thêm giải
            </span>
            <select
              className={selectClassName}
              onChange={(event) => {
                setTournament(event.target.value ? Number(event.target.value) : undefined);
              }}
              value={tournamentBundle ?? ''}
            >
              <option value="">Không</option>
              <option value="3">3 giải</option>
              <option value="5">5 giải</option>
              <option value="10">10 giải</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-foreground/[0.08] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Báo giá ước tính</p>
            {quote.data ? (
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                Tổng: {new Intl.NumberFormat('vi-VN').format(quote.data.totalPayableVnd)} VND
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Đang tính báo giá…</p>
            )}
          </div>
          <Button
            className="sm:min-w-44"
            disabled={!quote.data || activate.isPending}
            onClick={() => {
              activate.mutate();
            }}
            size="lg"
            type="button"
          >
            <CreditCard aria-hidden="true" className="size-4" />
            {activate.isPending ? 'Đang kích hoạt…' : 'Kích hoạt mô phỏng'}
          </Button>
        </div>
      </div>
    </section>
  );
}
