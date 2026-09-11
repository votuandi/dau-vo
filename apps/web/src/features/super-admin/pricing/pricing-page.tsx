import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { toast } from '@/components/ui/toast';
import { ApiClientError } from '@/services/api/client';
import {
  superAdminApi,
  type CreatePricingVersionInput,
  type PricingDiscountTier,
  type PricingVersion,
} from '@/services/api/super-admin';
import { PricingHistory, PricingSummary } from './pricing-components';

type Draft = Omit<CreatePricingVersionInput, 'discountTiers'> & {
  discountTiers: PricingDiscountTier[];
};
const tiers = [
  { type: 'DURATION' as const, quantity: 6, discountBasisPoints: 1000 },
  { type: 'DURATION' as const, quantity: 12, discountBasisPoints: 2500 },
  { type: 'TOURNAMENT' as const, quantity: 3, discountBasisPoints: 500 },
  { type: 'TOURNAMENT' as const, quantity: 5, discountBasisPoints: 1000 },
  { type: 'TOURNAMENT' as const, quantity: 10, discountBasisPoints: 2500 },
];
const toDraft = (v: PricingVersion): Draft => ({
  baseAmountVnd: v.baseAmountVnd,
  baseDurationMonths: v.baseDurationMonths,
  baseTournamentLimit: v.baseTournamentLimit,
  durationAddonUnitAmountVnd: v.durationAddonUnitAmountVnd,
  tournamentAddonUnitAmountVnd: v.tournamentAddonUnitAmountVnd,
  discountTiers: v.discountTiers.map(({ type, quantity, discountBasisPoints }) => ({
    type,
    quantity,
    discountBasisPoints,
  })),
});
const asVersion = (draft: Draft): PricingVersion => ({
  id: 'preview',
  active: false,
  createdAt: new Date().toISOString(),
  activatedAt: null,
  createdBy: null,
  ...draft,
});
function errorText(error: unknown) {
  if (!(error instanceof ApiClientError))
    return 'Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.';
  if (error.status === 401 || error.status === 403) return 'Bạn không có quyền quản lý bảng giá.';
  if (error.status === 409) return 'Bảng giá vừa thay đổi. Hãy tải lại và thử lại.';
  return error.body.code === 'INVALID_PRICING_TIERS'
    ? 'Các gói chuẩn phải gồm thời hạn 6, 12 và giải đấu 3, 5, 10; không được trùng số lượng.'
    : 'Dữ liệu bảng giá không hợp lệ.';
}
function validate(draft: Draft): string | null {
  const values = [
    draft.baseAmountVnd,
    draft.baseDurationMonths,
    draft.baseTournamentLimit,
    draft.durationAddonUnitAmountVnd,
    draft.tournamentAddonUnitAmountVnd,
  ];
  if (
    !values.every(Number.isInteger) ||
    draft.baseAmountVnd < 0 ||
    draft.baseDurationMonths < 1 ||
    draft.baseTournamentLimit < 1 ||
    draft.durationAddonUnitAmountVnd < 0 ||
    draft.tournamentAddonUnitAmountVnd < 0
  )
    return 'Các giá trị phải là số nguyên hợp lệ; giá cơ bản và phụ phí không âm, thời hạn/giới hạn lớn hơn 0.';
  const keys = draft.discountTiers.map((x) => `${x.type}:${String(x.quantity)}`);
  if (
    draft.discountTiers.some(
      (x) =>
        !Number.isInteger(x.quantity) ||
        x.quantity < 1 ||
        !Number.isInteger(x.discountBasisPoints) ||
        x.discountBasisPoints < 0 ||
        x.discountBasisPoints > 10000,
    ) ||
    new Set(keys).size !== keys.length ||
    tiers.some((x) => !keys.includes(`${x.type}:${String(x.quantity)}`))
  )
    return 'Mỗi gói phải có số lượng dương, giảm giá 0–100%, không trùng và đủ các gói chuẩn 6/12 tháng, 3/5/10 giải.';
  return null;
}
export function SuperAdminPricingPage() {
  const cache = useQueryClient();
  const pricing = useQuery({
    queryKey: ['super-admin', 'pricing'],
    queryFn: superAdminApi.pricing,
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = pricing.data?.find((x) => x.active);
  useEffect(() => {
    if (active && !draft) setDraft(toDraft(active));
  }, [active, draft]);
  const create = useMutation({
    mutationFn: superAdminApi.createPricing,
    onSuccess: async () => {
      setConfirming(false);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['super-admin', 'pricing'] }),
        cache.invalidateQueries({ queryKey: ['subscriptions', 'quote'] }),
      ]);
      toast({ title: 'Đã kích hoạt phiên bản bảng giá mới.', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: errorText(error), variant: 'destructive' });
    },
  });
  if (pricing.isPending) return <p>Đang tải bảng giá…</p>;
  if (pricing.isError || !active || !draft)
    return (
      <p role="alert">
        {pricing.isError ? errorText(pricing.error) : 'Không tìm thấy bảng giá đang áp dụng.'}
      </p>
    );
  const setNumber = (key: Exclude<keyof Draft, 'discountTiers'>, value: string) => {
    setDraft({ ...draft, [key]: Number(value) });
  };
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issue = validate(draft);
    if (issue) {
      toast({ title: issue, variant: 'destructive' });
      return;
    }
    setConfirming(true);
  };
  return (
    <section className="w-full max-w-5xl">
      <h1 className="text-3xl font-black">Quản lý bảng giá</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kích hoạt chỉ áp dụng cho báo giá và đơn hàng trong tương lai. Ảnh chụp đơn hàng lịch sử
        không thay đổi.
      </p>
      <div className="mt-6">
        <PricingSummary version={active} />
      </div>
      <form className="mt-8 rounded-lg border p-4" onSubmit={submit}>
        <h2 className="text-xl font-bold">Tạo phiên bản bảng giá mới</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Biểu mẫu đã điền từ phiên bản đang áp dụng.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ['baseAmountVnd', 'Giá cơ bản (VND)'],
              ['baseDurationMonths', 'Thời hạn cơ bản (tháng)'],
              ['baseTournamentLimit', 'Giới hạn cơ bản (giải)'],
              ['durationAddonUnitAmountVnd', 'Thêm một tháng (VND)'],
              ['tournamentAddonUnitAmountVnd', 'Thêm một giải (VND)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                className="mt-1 block w-full border p-2"
                min={key.includes('Amount') ? 0 : 1}
                onChange={(e) => {
                  setNumber(key, e.target.value);
                }}
                required
                step="1"
                type="number"
                value={draft[key]}
              />
            </label>
          ))}
        </div>
        <h3 className="mt-5 font-bold">Gói và giảm giá</h3>
        {draft.discountTiers.map((tier, index) => (
          <div className="mt-2 grid gap-2 sm:grid-cols-4" key={`${tier.type}-${String(index)}`}>
            <span className="py-2">{tier.type === 'DURATION' ? 'Thời hạn' : 'Giải đấu'}</span>
            <label>
              Số lượng
              <input
                className="ml-2 w-20 border p-1"
                min="1"
                onChange={(e) => {
                  const next = [...draft.discountTiers];
                  next[index] = { ...tier, quantity: Number(e.target.value) };
                  setDraft({ ...draft, discountTiers: next });
                }}
                type="number"
                value={tier.quantity}
              />
            </label>
            <label>
              Giảm (%)
              <input
                className="ml-2 w-20 border p-1"
                max="100"
                min="0"
                onChange={(e) => {
                  const next = [...draft.discountTiers];
                  next[index] = {
                    ...tier,
                    discountBasisPoints: Math.round(Number(e.target.value) * 100),
                  };
                  setDraft({ ...draft, discountTiers: next });
                }}
                step="0.01"
                type="number"
                value={tier.discountBasisPoints / 100}
              />
            </label>
            <button
              onClick={() => {
                setDraft({
                  ...draft,
                  discountTiers: draft.discountTiers.filter((_, i) => i !== index),
                });
              }}
              type="button"
            >
              Xóa
            </button>
          </div>
        ))}
        <button
          className="mt-3"
          onClick={() => {
            setDraft({
              ...draft,
              discountTiers: [
                ...draft.discountTiers,
                { type: 'DURATION', quantity: 1, discountBasisPoints: 0 },
              ],
            });
          }}
          type="button"
        >
          Thêm gói thời hạn
        </button>
        <button
          className="ml-3 mt-3"
          onClick={() => {
            setDraft({
              ...draft,
              discountTiers: [
                ...draft.discountTiers,
                { type: 'TOURNAMENT', quantity: 1, discountBasisPoints: 0 },
              ],
            });
          }}
          type="button"
        >
          Thêm gói giải đấu
        </button>
        <button className="ml-3 mt-3" type="submit">
          Xem thay đổi và kích hoạt
        </button>
      </form>
      {confirming ? (
        <section
          aria-modal="true"
          className="mt-6 rounded-lg border border-primary p-4"
          role="dialog"
        >
          <h2 className="text-xl font-bold">Xác nhận kích hoạt</h2>
          <p className="mt-2 text-sm">
            Kiểm tra thay đổi trước khi kích hoạt. Đây không phải báo giá chính thức.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PricingSummary title="Hiện tại" version={active} />
            <PricingSummary title="Phiên bản mới" version={asVersion(draft)} />
          </div>
          <button
            className="mt-4"
            disabled={create.isPending}
            onClick={() => {
              create.mutate(draft);
            }}
            type="button"
          >
            {create.isPending ? 'Đang kích hoạt…' : 'Xác nhận kích hoạt'}
          </button>
          <button
            className="ml-3 mt-4"
            disabled={create.isPending}
            onClick={() => {
              setConfirming(false);
            }}
            type="button"
          >
            Hủy
          </button>
        </section>
      ) : null}
      <PricingHistory versions={pricing.data.filter((x) => !x.active)} />
    </section>
  );
}
