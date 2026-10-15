import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import { tournamentQueryKeys } from '@/features/admin-management/queries';
import { adminManagementApi } from '@/services/api/admin-management';
import { parseIntermissionSeconds } from './fixture-presentation';

/**
 * Edits the break between rounds for one weight class. Mount it with a `key`
 * derived from the saved value so the draft resets when the server value changes.
 */
export function IntermissionDurationForm({
  initialSeconds,
  isReadOnly,
  tournamentId,
  weightClassId,
}: {
  readonly initialSeconds: number;
  readonly isReadOnly: boolean;
  readonly tournamentId: string;
  readonly weightClassId: string;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(initialSeconds));
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (seconds: number) =>
      adminManagementApi.updateWeightClass(tournamentId, weightClassId, {
        intermissionDurationSeconds: seconds,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.weightClasses(tournamentId),
      });
      notifyMutationSuccess('Đã cập nhật thời gian nghỉ.');
    },
    onError: (mutationError) => {
      notifyMutationError(mutationError, 'Không thể cập nhật thời gian nghỉ.');
    },
  });
  const disabled = isReadOnly || update.isPending;

  return (
    <form
      className="mt-5 rounded-xl border border-border bg-muted/20 p-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const seconds = parseIntermissionSeconds(value);
        if (seconds === null) {
          setError('Nhập số nguyên không âm. 0 để tắt thời gian nghỉ.');
          return;
        }
        setError(null);
        update.mutate(seconds);
      }}
    >
      <label className="text-sm font-semibold" htmlFor="weight-class-intermission-duration">
        Thời gian nghỉ giữa hiệp (giây)
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <input
          aria-describedby="weight-class-intermission-help weight-class-intermission-error"
          aria-invalid={Boolean(error)}
          className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary aria-[invalid=true]:border-destructive sm:w-64"
          disabled={disabled}
          id="weight-class-intermission-duration"
          inputMode="numeric"
          min={0}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          step={1}
          type="number"
          value={value}
        />
        <Button disabled={disabled} type="submit">
          {update.isPending ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground" id="weight-class-intermission-help">
        Nhập 0 để tắt thời gian nghỉ.
      </p>
      {error ? (
        <p
          className="mt-1 text-xs text-destructive"
          id="weight-class-intermission-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
