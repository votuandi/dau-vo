import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { BracketPreview } from '@/services/api/admin-management';
import { swappablePreviewAthleteIds } from './bracket-preview-swap';

export function BracketAthleteSwapDialog({
  preview,
  athleteId,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  readonly preview: BracketPreview;
  readonly athleteId: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (targetId: string) => void;
}) {
  const initialFocus = useRef<HTMLInputElement>(null);
  const current = preview.initialEntrants.find(
    (entrant) => entrant.athleteId === athleteId,
  )?.athlete;
  const swappableAthleteIds = swappablePreviewAthleteIds(preview.initialEntrants);
  const choices = preview.initialEntrants.filter(
    (entrant) =>
      entrant.athlete &&
      entrant.athleteId !== athleteId &&
      entrant.athleteId !== null &&
      swappableAthleteIds.has(entrant.athleteId),
  );
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Dialog
      className="max-w-xl"
      description="Chọn vận động viên để hoán đổi vị trí. Nếu một VĐV đang đặc cách được đổi, suất đặc cách sẽ chuyển theo vị trí nhánh đấu."
      initialFocusRef={initialFocus}
      onClose={onClose}
      pending={pending}
      title={`Đổi vị trí: ${current?.name ?? 'Vận động viên'}`}
    >
      <div
        className="mt-4 max-h-72 space-y-2 overflow-y-auto"
        role="radiogroup"
        aria-label="Vận động viên thay thế"
      >
        {choices.map((entrant, index) => (
          <label
            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            key={entrant.athleteId}
          >
            <input
              checked={selected === entrant.athleteId}
              disabled={pending}
              name="swap-athlete"
              onChange={() => {
                setSelected(entrant.athleteId);
              }}
              ref={index === 0 ? initialFocus : undefined}
              type="radio"
              value={entrant.athleteId ?? ''}
            />
            <span>
              <span className="block font-semibold">{entrant.athlete?.name}</span>
              <span className="text-sm text-muted-foreground">
                {entrant.athlete?.organizationName ?? 'Không đơn vị'}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Button disabled={pending} onClick={onClose} type="button" variant="outline">
          Hủy
        </Button>
        <Button
          disabled={pending || !selected}
          onClick={() => {
            if (selected) onSubmit(selected);
          }}
          type="button"
        >
          {pending ? 'Đang đổi…' : 'Đổi vị trí'}
        </Button>
      </div>
    </Dialog>
  );
}
