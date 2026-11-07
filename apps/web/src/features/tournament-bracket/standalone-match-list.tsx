import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  getApiErrorMessage,
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import { tournamentQueryKeys } from '@/features/admin-management/queries';
import { adminManagementApi, type AdminMatch } from '@/services/api/admin-management';

type MatchListResult = Awaited<ReturnType<typeof adminManagementApi.listMatches>>;

/** Matches created outside a bracket for the selected weight class. */
export function StandaloneMatchList({
  matches,
}: {
  readonly matches: UseQueryResult<MatchListResult>;
}) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<AdminMatch | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (match: AdminMatch) => adminManagementApi.deleteMatch(match.id),
    onSuccess: (_result, match) => {
      setPendingDelete(null);
      notifyMutationSuccess(`Đã xóa trận ${match.publicId}.`);
      // The prefix also covers the per-weight-class counts.
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.matches(match.tournamentId),
      });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể xóa trận.');
    },
  });

  if (matches.isPending)
    return (
      <div className="space-y-3">
        <h3 className="font-black">Trận riêng lẻ</h3>
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  if (matches.isError)
    return (
      <div role="alert">
        <h3 className="font-black">Trận riêng lẻ</h3>
        <p className="mt-2 text-sm text-destructive">
          {getApiErrorMessage(matches.error, 'Không thể tải danh sách trận.')}
        </p>
        <Button
          className="mt-3"
          onClick={() => void matches.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Thử lại
        </Button>
      </div>
    );
  const standalone = matches.data.matches.filter((match) => !match.bracketFixtureId);
  return (
    <div className="min-w-0">
      <h3 className="font-black">Trận riêng lẻ</h3>
      {standalone.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Chưa có trận riêng lẻ trong hạng cân này.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {standalone.map((match) => (
            <li
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
              key={match.id}
            >
              <span className="min-w-0 break-words">
                <Link className="font-bold underline" to={`/admin/matches/${match.id}`}>
                  {match.publicId}
                </Link>{' '}
                · {match.athletes.map((athlete) => athlete.name).join(' — ')}
              </span>
              <Button
                aria-label={`Xóa trận ${match.publicId}`}
                className="shrink-0"
                disabled={deleteMutation.isPending}
                onClick={() => setPendingDelete(match)}
                size="sm"
                title="Xóa trận"
                type="button"
                variant="destructive"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {pendingDelete ? (
        <ConfirmationDialog
          actionLabel="Xóa trận"
          busy={deleteMutation.isPending}
          description={`Trận ${pendingDelete.publicId} (${pendingDelete.athletes
            .map((athlete) => athlete.name)
            .join(
              ' — ',
            )}) sẽ bị ẩn khỏi danh sách, trang công khai và không thể đăng nhập điều hành nữa. Lịch sử chấm điểm vẫn được lưu để tra cứu.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => deleteMutation.mutate(pendingDelete)}
          title="Xóa trận riêng lẻ?"
          warning={
            pendingDelete.lifecycle === 'IN_PROGRESS'
              ? 'Trận đang diễn ra. Các phiên điều hành và chấm điểm sẽ bị ngắt ngay.'
              : 'Thao tác này không thể hoàn tác trên giao diện.'
          }
        />
      ) : null}
    </div>
  );
}
