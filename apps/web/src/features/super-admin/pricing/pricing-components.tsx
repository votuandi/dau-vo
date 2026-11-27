import { Badge } from '@/components/ui/badge';
import type { PricingVersion } from '@/services/api/super-admin';
import { date, money } from './pricing-format';

export function TierList({ version }: { readonly version: PricingVersion }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['DURATION', 'TOURNAMENT'] as const).map((type) => (
        <div className="rounded-xl border border-foreground/[0.08] bg-muted/40 p-3.5" key={type}>
          <h3 className="text-xs font-medium text-muted-foreground">
            {type === 'DURATION' ? 'Gói thời hạn' : 'Gói giải đấu'}
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {version.discountTiers
              .filter((tier) => tier.type === type)
              .map((tier) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={tier.id ?? `${type}-${String(tier.quantity)}`}
                >
                  <span>{tier.quantity} đơn vị</span>
                  <Badge tone="success">giảm {tier.discountBasisPoints / 100}%</Badge>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function PricingSummary({
  version,
  title = 'Bảng giá đang áp dụng',
}: {
  readonly version: PricingVersion;
  readonly title?: string;
}) {
  return (
    <article className="app-card border-primary/25 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        {version.active ? (
          <Badge dot tone="success">
            Đang áp dụng
          </Badge>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Giá cơ bản</dt>
          <dd className="mt-1 font-bold tabular-nums">{money(version.baseAmountVnd)}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Thời hạn cơ bản</dt>
          <dd className="mt-1 font-bold tabular-nums">{version.baseDurationMonths} tháng</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Giới hạn giải cơ bản</dt>
          <dd className="mt-1 font-bold tabular-nums">{version.baseTournamentLimit} giải</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Thêm một tháng</dt>
          <dd className="mt-1 font-bold tabular-nums">
            {money(version.durationAddonUnitAmountVnd)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Thêm một giải</dt>
          <dd className="mt-1 font-bold tabular-nums">
            {money(version.tournamentAddonUnitAmountVnd)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Hiệu lực / tạo bởi</dt>
          <dd className="mt-1 font-semibold">
            {date(version.activatedAt ?? version.createdAt)}
            {version.createdBy
              ? ` · ${version.createdBy.fullName ?? version.createdBy.username}`
              : ''}
          </dd>
        </div>
      </dl>
      <div className="mt-4">
        <TierList version={version} />
      </div>
    </article>
  );
}

export function PricingHistory({ versions }: { readonly versions: readonly PricingVersion[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-black tracking-tight">Lịch sử phiên bản</h2>
      <div className="app-table-wrap mt-4">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-foreground/[0.08] bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Giá cơ bản</th>
              <th className="px-4 py-3 font-medium">Thời hạn / giải</th>
              <th className="px-4 py-3 font-medium">Tạo lúc</th>
              <th className="px-4 py-3 font-medium">Người tạo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {versions.map((version) => (
              <tr className="transition-colors hover:bg-sky-50/40" key={version.id}>
                <td className="px-4 py-3">
                  <Badge tone={version.active ? 'success' : 'neutral'}>
                    {version.active ? 'Đang áp dụng' : 'Lịch sử (chỉ xem)'}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-semibold tabular-nums">
                  {money(version.baseAmountVnd)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {version.baseDurationMonths} tháng / {version.baseTournamentLimit} giải
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {date(version.activatedAt ?? version.createdAt)}
                </td>
                <td className="px-4 py-3">
                  {version.createdBy?.fullName ?? version.createdBy?.username ?? 'Hệ thống'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
