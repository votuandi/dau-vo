import type { PricingVersion } from '@/services/api/super-admin';
import { date, money } from './pricing-format';
export function TierList({ version }: { readonly version: PricingVersion }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['DURATION', 'TOURNAMENT'] as const).map((type) => (
        <div key={type}>
          <h3 className="font-bold">{type === 'DURATION' ? 'Gói thời hạn' : 'Gói giải đấu'}</h3>
          <ul className="mt-1 text-sm">
            {version.discountTiers
              .filter((tier) => tier.type === type)
              .map((tier) => (
                <li key={tier.id ?? `${type}-${String(tier.quantity)}`}>
                  {tier.quantity} đơn vị — giảm {tier.discountBasisPoints / 100}%
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
    <article className="rounded-lg border border-primary/30 bg-card p-4">
      <h2 className="text-xl font-bold">{title}</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt>Giá cơ bản</dt>
          <dd className="font-semibold">{money(version.baseAmountVnd)}</dd>
        </div>
        <div>
          <dt>Thời hạn cơ bản</dt>
          <dd className="font-semibold">{version.baseDurationMonths} tháng</dd>
        </div>
        <div>
          <dt>Giới hạn giải cơ bản</dt>
          <dd className="font-semibold">{version.baseTournamentLimit} giải</dd>
        </div>
        <div>
          <dt>Thêm một tháng</dt>
          <dd className="font-semibold">{money(version.durationAddonUnitAmountVnd)}</dd>
        </div>
        <div>
          <dt>Thêm một giải</dt>
          <dd className="font-semibold">{money(version.tournamentAddonUnitAmountVnd)}</dd>
        </div>
        <div>
          <dt>Hiệu lực / tạo bởi</dt>
          <dd className="font-semibold">
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
      <h2 className="text-xl font-bold">Lịch sử phiên bản</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Trạng thái</th>
              <th className="p-2">Giá cơ bản</th>
              <th className="p-2">Thời hạn / giải</th>
              <th className="p-2">Tạo lúc</th>
              <th className="p-2">Người tạo</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr className="border-b" key={version.id}>
                <td className="p-2">{version.active ? 'Đang áp dụng' : 'Lịch sử (chỉ xem)'}</td>
                <td className="p-2">{money(version.baseAmountVnd)}</td>
                <td className="p-2">
                  {version.baseDurationMonths} tháng / {version.baseTournamentLimit} giải
                </td>
                <td className="p-2">{date(version.activatedAt ?? version.createdAt)}</td>
                <td className="p-2">
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
