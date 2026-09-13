import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BracketChart } from './bracket-chart';
import type { BracketPreview } from '@/services/api/admin-management';

export function BracketPreviewDialog({
  preview,
  pending,
  error,
  canConfirm = true,
  onConfirm,
  onRedraw,
  onCancel,
}: {
  readonly preview: BracketPreview;
  readonly pending: boolean;
  readonly error: string | null;
  readonly canConfirm?: boolean;
  readonly onConfirm: () => void;
  readonly onRedraw: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      className="max-w-6xl"
      description="Kiểm tra kết quả bốc thăm trước khi xác nhận."
      initialFocusRef={ref}
      onClose={onCancel}
      pending={pending}
      title="Xem trước nhánh đấu"
    >
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
        <Button disabled={pending || !canConfirm} onClick={onConfirm} ref={ref} type="button">
          {pending ? 'Đang xác nhận…' : 'Đồng ý'}
        </Button>
      </div>
    </Dialog>
  );
}
