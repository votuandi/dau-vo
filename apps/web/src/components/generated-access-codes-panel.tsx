import type { GeneratedAccessCode } from '@/services/api/admin-management';
import { accessCodeRoleLabels } from '@/features/admin-management/presentation';
import { ClipboardCopyButton } from '@/components/ui/clipboard-copy-button';

interface GeneratedAccessCodesPanelProps {
  readonly accessCodes: readonly GeneratedAccessCode[];
  readonly matchPublicId: string;
  readonly onDismiss: () => void;
  readonly title?: string;
}

export function GeneratedAccessCodesPanel({
  accessCodes,
  matchPublicId,
  onDismiss,
  title = 'Mã truy cập vừa tạo',
}: GeneratedAccessCodesPanelProps) {
  if (accessCodes.length === 0) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6">
            Lưu các mã này ngay bây giờ. Vì lý do bảo mật, mã gốc sẽ không được hiển thị lại sau khi
            rời trang hoặc đóng thông báo này. Mỗi nút sao chép bao gồm mã trận đấu, vai trò và mã
            truy cập tương ứng.
          </p>
        </div>
        <button
          className="self-start rounded-md px-3 py-2 text-sm font-semibold hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          onClick={onDismiss}
          type="button"
        >
          Đã lưu, đóng
        </button>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {accessCodes.map((accessCode) => (
          <div className="rounded-lg border border-amber-200 bg-white p-4" key={accessCode.role}>
            <dt className="text-xs font-bold uppercase tracking-wider text-amber-800">
              {accessCodeRoleLabels[accessCode.role]}
            </dt>
            <dd className="mt-2 break-all font-mono text-xl font-black tracking-wider text-slate-950">
              {accessCode.code}
            </dd>
            <ClipboardCopyButton
              accessibleLabel={`Sao chép thông tin ${accessCodeRoleLabels[accessCode.role]}`}
              className="mt-3 w-full"
              label="Sao chép thông tin"
              value={[
                `Mã trận đấu: ${matchPublicId}`,
                `Vai trò: ${accessCodeRoleLabels[accessCode.role]}`,
                `Mã truy cập: ${accessCode.code}`,
              ].join('\n')}
            />
          </div>
        ))}
      </dl>
    </section>
  );
}
