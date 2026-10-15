import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/features/admin-management/presentation';
import { tournamentQueryKeys } from '@/features/admin-management/queries';
import { ApiClientError } from '@/services/api/client';
import { adminManagementApi } from '@/services/api/admin-management';
import { bracketQueryKeys } from './query-keys';

interface UnsafeCancellationMatch {
  readonly id: string;
  readonly publicId: string;
}

function isUnsafeCancellationMatch(value: unknown): value is UnsafeCancellationMatch {
  if (typeof value !== 'object' || value === null) return false;
  const match = value as Record<string, unknown>;
  return typeof match.id === 'string' && typeof match.publicId === 'string';
}

/**
 * Cancels the active bracket of a weight class. When the server reports
 * matches that already started, it offers a forced cancellation instead.
 */
export function CancelBracketDialog({
  onCancelled,
  onClose,
  tournamentId,
  weightClassId,
}: {
  readonly onCancelled: () => void;
  readonly onClose: () => void;
  readonly tournamentId: string;
  readonly weightClassId: string;
}) {
  const queryClient = useQueryClient();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unsafeMatches, setUnsafeMatches] = useState<readonly UnsafeCancellationMatch[]>([]);

  const cancel = useMutation({
    mutationFn: (force: boolean) =>
      adminManagementApi.cancelBracket(tournamentId, weightClassId, reason.trim(), force),
    onSuccess: () => {
      const detailKey = bracketQueryKeys.detail(tournamentId, weightClassId);
      // Drop the cached bracket so a stale success never flashes after cancellation.
      queryClient.removeQueries({ queryKey: detailKey, exact: true });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({
          queryKey: tournamentQueryKeys.weightClasses(tournamentId),
        }),
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournamentId) }),
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matchCounts(tournamentId) }),
        queryClient.invalidateQueries({
          queryKey: ['admin', 'tournaments', tournamentId, 'athletes'],
        }),
      ]);
      onCancelled();
    },
    onError: (mutationError) => {
      if (
        mutationError instanceof ApiClientError &&
        mutationError.body.code === 'BRACKET_CANCELLATION_UNSAFE'
      ) {
        const matches = mutationError.body.unsafeMatches;
        setUnsafeMatches(Array.isArray(matches) ? matches.filter(isUnsafeCancellationMatch) : []);
        setError('Đã có trận đấu đã hoặc đang diễn ra.');
        return;
      }
      setUnsafeMatches([]);
      setError(getApiErrorMessage(mutationError, 'Không thể hủy nhánh đấu.'));
    },
  });

  const canSubmit = Boolean(reason.trim()) && !cancel.isPending;

  return (
    <Dialog
      description={
        unsafeMatches.length
          ? 'Xác nhận cưỡng bức sẽ xóa các trận được cảnh báo và nhánh đấu hiện tại.'
          : 'Thao tác này lưu nhánh cũ vào lịch sử và không xóa mã truy cập hay dữ liệu trận đấu.'
      }
      initialFocusRef={reasonRef}
      onClose={onClose}
      pending={cancel.isPending}
      title="Hủy nhánh đấu?"
    >
      <textarea
        aria-label="Lý do hủy"
        className="mt-4 w-full rounded border p-2"
        maxLength={500}
        onChange={(event) => {
          setReason(event.target.value);
        }}
        placeholder="Lý do hủy (bắt buộc)"
        ref={reasonRef}
        value={reason}
      />
      {error ? (
        <div className="mt-3 break-words text-sm text-destructive" role="alert">
          {unsafeMatches.length ? (
            <p>
              {error} Nếu xóa các trận đấu sau đây sẽ bị xóa:{' '}
              {unsafeMatches.map((match) => match.publicId).join(', ')}
            </p>
          ) : (
            <p>{error}</p>
          )}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {cancel.isPending ? 'Đang hủy nhánh đấu.' : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!canSubmit}
          onClick={() => {
            cancel.mutate(false);
          }}
          type="button"
        >
          Xác nhận hủy
        </Button>
        {unsafeMatches.length ? (
          <Button
            disabled={!canSubmit}
            onClick={() => {
              cancel.mutate(true);
            }}
            type="button"
            variant="destructive"
          >
            Vẫn xác nhận hủy trận
          </Button>
        ) : null}
        <Button disabled={cancel.isPending} onClick={onClose} type="button" variant="outline">
          Quay lại
        </Button>
      </div>
    </Dialog>
  );
}
