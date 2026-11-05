import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { getApiErrorMessage, notifyMutationSuccess } from './presentation';
import { matchQueryKeys, tournamentQueryKeys } from './queries';
import { adminManagementApi, type AdminMatch } from '@/services/api/admin-management';
import { createUuid } from '@/lib/uuid';
import { AthleteColor } from '@/types/shared';

export function MatchWinnerDecisionDialog({
  match,
  onClose,
}: {
  readonly match: AdminMatch;
  readonly onClose: () => void;
}) {
  const qc = useQueryClient();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [winnerColor, setWinnerColor] = useState<AthleteColor | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(createUuid);
  const save = useMutation({
    mutationFn: () => {
      if (!winnerColor) throw new Error('Chọn vận động viên chiến thắng.');
      return adminManagementApi.decideMatchWinner(match.id, {
        winnerColor,
        reason: reason.trim(),
        idempotencyKey,
      });
    },
    onSuccess: () => {
      notifyMutationSuccess('Đã lưu người chiến thắng chính thức.');
      void Promise.all([
        qc.invalidateQueries({ queryKey: matchQueryKeys.detail(match.id) }),
        qc.invalidateQueries({ queryKey: matchQueryKeys.monitoring(match.id) }),
        qc.invalidateQueries({ queryKey: tournamentQueryKeys.matches(match.tournamentId) }),
        qc.invalidateQueries({ queryKey: ['admin', 'brackets'] }),
      ]);
      onClose();
    },
    onError: (mutationError) => {
      setError(getApiErrorMessage(mutationError, 'Không thể lưu người chiến thắng.'));
    },
  });

  return (
    <Dialog
      title="Chọn người chiến thắng"
      description="Chọn VĐV thắng chính thức bất kể trận chưa bắt đầu, đang diễn ra hay đã hoàn thành. Kết quả hiện tại sẽ được thay thế và thao tác được ghi vào lịch sử."
      initialFocusRef={reasonRef}
      pending={save.isPending}
      onClose={onClose}
    >
      <form noValidate onSubmit={(event) => {
        event.preventDefault();
        if (!winnerColor) { setError('Chọn vận động viên chiến thắng.'); return; }
        if (!reason.trim()) { setError('Nhập lý do quyết định.'); reasonRef.current?.focus(); return; }
        setError(null);
        save.mutate();
      }}>
        {match.bracketFixtureId ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Nếu người thắng thay đổi, trận vòng sau đã chuẩn bị sẽ được tách khỏi nhánh đấu để giữ lịch sử.
          </p>
        ) : null}
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-2 text-sm font-bold">Vận động viên chiến thắng</legend>
          {match.athletes.map((athlete) => (
            <label key={athlete.id} className="flex cursor-pointer items-center gap-2 rounded border p-3">
              <input type="radio" name="winnerColor" value={athlete.color}
                checked={winnerColor === athlete.color} disabled={save.isPending}
                onChange={() => { setWinnerColor(athlete.color); setError(null); }} />
              <span>{athlete.color === AthleteColor.RED ? 'ĐỎ' : 'XANH'} — {athlete.name}</span>
            </label>
          ))}
        </fieldset>
        <label className="mt-4 block text-sm font-bold" htmlFor="match-winner-reason">Lý do</label>
        <textarea id="match-winner-reason" className="mt-1 w-full rounded border p-2"
          ref={reasonRef} maxLength={500} required value={reason} disabled={save.isPending}
          onChange={(event) => { setReason(event.target.value); setError(null); }} />
        {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Xác nhận người thắng'}
          </Button>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Hủy</Button>
        </div>
      </form>
    </Dialog>
  );
}
