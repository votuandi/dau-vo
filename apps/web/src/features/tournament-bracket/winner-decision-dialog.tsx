import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  getApiErrorMessage,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import { tournamentQueryKeys } from '@/features/admin-management/queries';
import { adminManagementApi } from '@/services/api/admin-management';
import {
  manualWinnerCandidates,
  manualWinnerDecisionType,
  type BracketFixture,
} from './fixture-presentation';
import { bracketQueryKeys } from './query-keys';

/**
 * Records an administrator's winner for a tied or forfeited fixture. Mount it
 * with a `key` per fixture so each opening starts a fresh idempotent action.
 */
export function WinnerDecisionDialog({
  bracketId,
  fixture,
  initialWinnerId,
  onClose,
  tournamentId,
  weightClassId,
}: {
  readonly bracketId: string;
  readonly fixture: BracketFixture;
  readonly initialWinnerId: string | null;
  readonly onClose: () => void;
  readonly tournamentId: string;
  readonly weightClassId: string;
}) {
  const queryClient = useQueryClient();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [winnerId, setWinnerId] = useState(initialWinnerId);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Created once per opening so retries of the same action stay idempotent.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const decisionType = manualWinnerDecisionType(fixture);
  const withdrawal = decisionType === 'WITHDRAWAL_OR_INJURY';

  const decide = useMutation({
    mutationFn: (entrantId: string) =>
      adminManagementApi.decideBracketFixtureWinner(tournamentId, bracketId, fixture.id, {
        entrantId,
        decisionType: decisionType ?? 'WITHDRAWAL_OR_INJURY',
        reason: reason.trim(),
        idempotencyKey,
      }),
    onSuccess: () => {
      notifyMutationSuccess('Đã xác định người thắng.');
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: bracketQueryKeys.detail(tournamentId, weightClassId),
        }),
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournamentId) }),
      ]);
      onClose();
    },
    onError: (mutationError) => {
      setError(
        getApiErrorMessage(
          mutationError,
          'Không thể xác định người thắng. Trạng thái có thể đã thay đổi.',
        ),
      );
    },
  });

  return (
    <Dialog
      description={
        withdrawal
          ? 'Ghi nhận VĐV rút lui hoặc chấn thương không thể tiếp tục. Chọn người thắng và nêu rõ lý do.'
          : 'Chọn vận động viên chiến thắng và ghi rõ lý do quyết định hòa.'
      }
      initialFocusRef={reasonRef}
      onClose={onClose}
      pending={decide.isPending}
      title={withdrawal ? 'Chọn VĐV chiến thắng do rút lui/chấn thương' : 'Chọn VĐV chiến thắng'}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!winnerId) {
            setError('Chọn vận động viên chiến thắng.');
            return;
          }
          if (!reason.trim()) {
            setError('Nhập lý do quyết định.');
            reasonRef.current?.focus();
            return;
          }
          setError(null);
          decide.mutate(winnerId);
        }}
      >
        <fieldset className="mt-4">
          <legend className="text-sm font-bold">Vận động viên chiến thắng</legend>
          <div className="mt-2 space-y-2">
            {manualWinnerCandidates(fixture).map((entrant) => (
              <label
                className="flex cursor-pointer items-center gap-2 rounded border p-2"
                key={entrant.id}
              >
                <input
                  checked={winnerId === entrant.id}
                  disabled={decide.isPending}
                  name="winner"
                  onChange={() => {
                    setWinnerId(entrant.id);
                    setError(null);
                  }}
                  type="radio"
                  value={entrant.id}
                />
                <span className="min-w-0 break-words">{entrant.snapshotName}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 block text-sm font-bold" htmlFor="winner-reason">
          Lý do
        </label>
        <textarea
          aria-describedby={error ? 'winner-decision-error' : undefined}
          aria-invalid={Boolean(error)}
          className="mt-1 w-full rounded border p-2 aria-[invalid=true]:border-destructive"
          disabled={decide.isPending}
          id="winner-reason"
          maxLength={500}
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError(null);
          }}
          ref={reasonRef}
          required
          value={reason}
        />
        {error ? (
          <p className="mt-2 text-sm text-destructive" id="winner-decision-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={decide.isPending} type="submit">
            {decide.isPending ? 'Đang lưu…' : 'Xác nhận người thắng'}
          </Button>
          <Button disabled={decide.isPending} onClick={onClose} type="button" variant="outline">
            Hủy
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
