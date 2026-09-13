import { Button } from '@/components/ui/button';
import { BracketChart } from './bracket-chart';
import type { BracketPreview } from '@/services/api/admin-management';

export function BracketPreviewPanel({
  preview,
  pending,
  error,
  canConfirm = true,
  onConfirm,
  onRedraw,
  onCancel,
  onChangeDesignatedAthletes,
}: {
  readonly preview: BracketPreview;
  readonly pending: boolean;
  readonly error: string | null;
  readonly canConfirm?: boolean;
  readonly onConfirm: () => void;
  readonly onRedraw: () => void;
  readonly onCancel: () => void;
  readonly onChangeDesignatedAthletes: () => void;
}) {
  return (
    <section
      aria-labelledby="bracket-preview-title"
      className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      <div>
        <h4 className="font-black" id="bracket-preview-title">
          Xem trước nhánh đấu
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Kiểm tra kết quả bốc thăm trước khi xác nhận.
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm">
          <div>
            <dt className="text-muted-foreground">VĐV</dt>
            <dd className="font-bold">{preview.summary.athleteCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Đặc cách</dt>
            <dd className="font-bold">{preview.summary.byeCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vòng</dt>
            <dd className="font-bold">{preview.summary.roundCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trận</dt>
            <dd className="font-bold">{preview.summary.totalFixtureCount}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-5">
        <BracketChart data={preview} />
      </div>
      {error ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button disabled={pending} onClick={onCancel} type="button" variant="outline">
          Hủy bỏ
        </Button>
        <Button disabled={pending} onClick={onRedraw} type="button" variant="outline">
          {pending ? 'Đang bốc…' : 'Bốc thăm lại'}
        </Button>
        <Button
          disabled={pending}
          onClick={onChangeDesignatedAthletes}
          type="button"
          variant="outline"
        >
          Thay đổi VĐV đặc cách
        </Button>
        <Button disabled={pending || !canConfirm} onClick={onConfirm} type="button">
          {pending ? 'Đang xác nhận…' : 'Đồng ý'}
        </Button>
      </div>
    </section>
  );
}
