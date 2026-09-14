import { useEffect, useState } from 'react';
import type { ActiveBracket } from '@/services/api/admin-management';
import { Button } from '@/components/ui/button';

const EMPTY_STAFFING: readonly NonNullable<ActiveBracket['staffing']>[number][] = [];

export function BracketStaffingEditor({
  data,
  disabled,
  pending,
  onSave,
}: {
  readonly data: ActiveBracket;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSave: (roundNumber: number, count: number) => void;
}) {
  const [values, setValues] = useState<Record<number, string>>({});
  const rows = data.staffing ?? EMPTY_STAFFING;
  useEffect(() => {
    setValues(Object.fromEntries(rows.map((x) => [x.roundNumber, String(x.requiredRefereeCount)])));
  }, [rows]);
  const active = data.activeRefereeCount ?? 0;
  return (
    <section className="mt-5 rounded-xl border p-4" aria-label="Cấu hình trọng tài theo vòng">
      <h3 className="font-bold">Trọng tài theo vòng</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Hiện có {active} trọng tài hoạt động. Mỗi trận cần ít nhất 3 trọng tài, số lẻ, và không vượt
        quá số đang hoạt động. Giám biên luôn là 1.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((staffing) => {
          const locked = data.fixtures.some(
            (fixture) =>
              fixture.roundNumber === staffing.roundNumber &&
              ['MATCH_PREPARED', 'AWAITING_WINNER', 'COMPLETED'].includes(fixture.status),
          );
          return (
            <div className="flex items-end gap-2 rounded-lg border p-3" key={staffing.id}>
              <label className="flex-1 text-sm font-medium">
                {staffing.roundLabel}
                <input
                  aria-label={`${staffing.roundLabel} referee count`}
                  className="mt-1 w-full rounded border px-2 py-1"
                  disabled={disabled || locked || pending}
                  inputMode="numeric"
                  min="3"
                  step="2"
                  type="number"
                  value={values[staffing.roundNumber] ?? ''}
                  onChange={(event) => {
                    setValues((old) => ({ ...old, [staffing.roundNumber]: event.target.value }));
                  }}
                />
              </label>
              <Button
                disabled={
                  disabled ||
                  locked ||
                  pending ||
                  !Number.isInteger(Number(values[staffing.roundNumber]))
                }
                onClick={() => {
                  onSave(staffing.roundNumber, Number(values[staffing.roundNumber]));
                }}
                size="sm"
                type="button"
              >
                {locked ? 'Đã khóa' : 'Lưu'}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
