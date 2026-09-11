import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscriptionsApi } from '@/services/api/subscriptions';

export function SubscriptionPage() {
  const [durationBundle, setDuration] = useState<number>();
  const [tournamentBundle, setTournament] = useState<number>();
  const navigate = useNavigate();
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
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      void navigate('/admin');
    },
  });
  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-8">
      <h1 className="text-3xl font-black">Gói quản trị</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kích hoạt mô phỏng MVP — không phải thanh toán bên ngoài.
      </p>
      {entitlement.data ? (
        <p className="mt-4">
          Còn {entitlement.data.remainingTournamentQuota}/{entitlement.data.tournamentLimit} giải.
        </p>
      ) : null}
      <label className="mt-6 block">
        Thêm tháng
        <select
          className="ml-2 border"
          onChange={(event) => {
            setDuration(event.target.value ? Number(event.target.value) : undefined);
          }}
        >
          <option value="">Không</option>
          <option value="6">6 tháng</option>
          <option value="12">12 tháng</option>
        </select>
      </label>
      <label className="mt-3 block">
        Thêm giải
        <select
          className="ml-2 border"
          onChange={(event) => {
            setTournament(event.target.value ? Number(event.target.value) : undefined);
          }}
        >
          <option value="">Không</option>
          <option value="3">3 giải</option>
          <option value="5">5 giải</option>
          <option value="10">10 giải</option>
        </select>
      </label>
      {quote.data ? (
        <p className="mt-6 font-bold">
          Tổng: {new Intl.NumberFormat('vi-VN').format(quote.data.totalPayableVnd)} VND
        </p>
      ) : (
        <p className="mt-6">Đang tính báo giá…</p>
      )}
      <button
        className="mt-6 rounded bg-primary px-4 py-2 text-primary-foreground"
        disabled={!quote.data || activate.isPending}
        onClick={() => {
          activate.mutate();
        }}
        type="button"
      >
        {activate.isPending ? 'Đang kích hoạt…' : 'Kích hoạt mô phỏng'}
      </button>
    </section>
  );
}
