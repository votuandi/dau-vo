import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { AthleteColor, MatchAccessRole } from '@/types/shared';
import { formatDateTimeWithSeconds } from '@/features/admin-management/presentation';
import { varMonitoringQueryOptions } from './queries';

const roleLabels: Record<MatchAccessRole, string> = {
  [MatchAccessRole.JUDGE_1]: 'Giám định 1',
  [MatchAccessRole.JUDGE_2]: 'Giám định 2',
  [MatchAccessRole.JUDGE_3]: 'Giám định 3',
  [MatchAccessRole.SUPERVISOR]: 'Giám sát',
};

function timestamp(value: string | null | undefined): string {
  return value ? formatDateTimeWithSeconds(value) : '—';
}

function colorLabel(color: AthleteColor | null | undefined): string {
  if (color === AthleteColor.RED) return 'ĐỎ';
  if (color === AthleteColor.BLUE) return 'XANH';
  return '—';
}

function athleteColorLabel(color: AthleteColor): string {
  return color === AthleteColor.RED ? 'VĐV đỏ' : 'VĐV xanh';
}

function judgeVoteLabel(vote: { judgePosition: number | null; judgeSlot: string | null }): string {
  if (vote.judgePosition !== null) return `Giám định ${String(vote.judgePosition)}`;
  if (vote.judgeSlot && vote.judgeSlot in roleLabels) {
    return roleLabels[vote.judgeSlot as MatchAccessRole];
  }
  return 'Giám định';
}

function formatRoundElapsedTime(roundElapsedMs: number | null, roundNumber: number | null): string {
  if (roundElapsedMs === null || roundNumber === null) {
    return 'Không xác định thời gian trong hiệp';
  }
  const seconds = Math.max(0, Math.floor(roundElapsedMs / 1_000));
  return `Giây ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} trong hiệp ${String(roundNumber)}`;
}

function scoreEventTypeLabel(type: string): string {
  if (type === 'REFEREE_POINT') return 'Điểm giám định';
  if (type === 'PENALTY') return 'Phạt';
  return type;
}

function metadataText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function auditEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    MATCH_RESULT_RESET: 'Đã hủy kết quả toàn trận',
    MATCH_RESULT_RESET_UNDONE: 'Đã hoàn tác hủy kết quả toàn trận',
    ROUND_RESULT_CANCELLED: 'Đã hủy kết quả hiệp',
    ROUND_RESULT_CANCEL_UNDONE: 'Đã hoàn tác hủy kết quả hiệp',
    ROUND_PAUSED: 'Đã tạm dừng hiệp',
    ROUND_RESUMED: 'Đã tiếp tục hiệp',
  };
  return labels[eventType] ?? eventType;
}

function HistoryList<T>({
  empty,
  entries,
  renderEntry,
}: {
  readonly empty: string;
  readonly entries: readonly T[];
  readonly renderEntry: (entry: T) => React.ReactNode;
}) {
  return entries.length ? (
    <ul className="mt-3 space-y-2">{entries.map(renderEntry)}</ul>
  ) : (
    <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
  );
}

export function VarMonitoringDialog({
  matchId,
  onClose,
}: {
  readonly matchId: string;
  readonly onClose: () => void;
}) {
  const monitoring = useQuery(varMonitoringQueryOptions(matchId));
  const data = monitoring.data;
  const failed = monitoring.isError;
  // Older API deployments can omit a newly added collection. Preserve a
  // readable dialog rather than treating the whole monitoring response as bad.
  const scoringWindows = data?.scoringWindows ?? [];
  const penalties = data?.penalties ?? [];
  const scoreEvents = data?.scoreEvents ?? [];
  const auditLogs = data?.auditLogs ?? [];

  return (
    <Dialog
      className="max-w-5xl border border-amber-300/60 bg-amber-50 text-amber-950"
      description="Dữ liệu chỉ đọc phục vụ kiểm tra VAR của trận đấu hiện tại."
      onClose={onClose}
      title="Check VAR"
    >
      {failed ? (
        <div className="mt-5" role="alert">
          <p className="text-sm text-destructive">
            {data ? 'Không thể đồng bộ dữ liệu VAR.' : 'Không thể tải dữ liệu VAR.'}
          </p>
          <Button className="mt-3" onClick={() => void monitoring.refetch()} type="button">
            Thử lại
          </Button>
        </div>
      ) : null}
      {!data ? (
        <p className="mt-5 text-sm text-muted-foreground">Đang tải dữ liệu VAR…</p>
      ) : (
        <div className="mt-5 grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
          <section className="rounded-xl border border-amber-200 bg-amber-100/60 p-4">
            <h3 className="font-black">Lịch sử cửa sổ chấm điểm ({scoringWindows.length})</h3>
            <HistoryList
              empty="Chưa có cửa sổ chấm điểm."
              entries={scoringWindows}
              renderEntry={(entry) => (
                <li className="rounded-lg bg-amber-50 p-3 text-sm" key={entry.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-bold">
                      Hiệp {entry.roundNumber} ·{' '}
                      {entry.scoreAwarded && entry.winningColor
                        ? `${colorLabel(entry.winningColor)} +1`
                        : 'Không tính điểm'}
                      {entry.invalidatedAt ? ' · Đã hủy kết quả' : ''}
                    </p>
                    <div className="text-right text-xs text-amber-900/75">
                      <time className="block">{timestamp(entry.occurredAt)}</time>
                      <p className="mt-1">
                        {formatRoundElapsedTime(entry.roundElapsedMs, entry.roundNumber)}
                      </p>
                    </div>
                  </div>
                  {(entry.judgeVotes ?? []).length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {(entry.judgeVotes ?? []).map((vote) => (
                        <li
                          key={`${String(vote.judgePosition ?? vote.judgeSlot ?? 'unknown')}-${vote.serverReceivedAt}`}
                        >
                          {judgeVoteLabel(vote)}:{' '}
                          <strong>{`+1 ${athleteColorLabel(vote.athleteColor)}`}</strong>{' '}
                          <span className="text-amber-900/75">
                            [{timestamp(vote.serverReceivedAt)}]
                          </span>
                          {vote.invalidatedAt ? (
                            <span className="ml-2 font-bold">Đã vô hiệu</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )}
            />
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-100/60 p-4">
            <h3 className="font-black">Lỗi phạt ({penalties.length})</h3>
            <HistoryList
              empty="Chưa có lỗi phạt."
              entries={penalties}
              renderEntry={(entry) => (
                <li className="rounded-lg bg-amber-50 p-3 text-sm" key={entry.id}>
                  Hiệp {entry.roundNumber ?? '—'} · {colorLabel(entry.athlete?.color)} ·{' '}
                  {entry.athlete?.name ?? '—'} · <strong>{entry.value}</strong> ·{' '}
                  {timestamp(entry.createdAt)}
                  {entry.revertedAt ? <span className="ml-2 font-bold">Đã hoàn tác</span> : null}
                </li>
              )}
            />
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-100/60 p-4">
            <h3 className="font-black">Score events ({scoreEvents.length})</h3>
            <HistoryList
              empty="Chưa có score event."
              entries={scoreEvents}
              renderEntry={(entry) => (
                <li className="rounded-lg bg-amber-50 p-3 text-sm" key={entry.id}>
                  {scoreEventTypeLabel(entry.type)} · Hiệp {entry.roundNumber ?? '—'} ·{' '}
                  {colorLabel(entry.athlete?.color)} · {entry.athlete?.name ?? '—'} ·{' '}
                  <strong>
                    {entry.value > 0 ? '+' : ''}
                    {entry.value}
                  </strong>{' '}
                  · {timestamp(entry.occurredAt)}
                  <span className="text-xs text-amber-900/75">
                    {' '}
                    · {formatRoundElapsedTime(entry.roundElapsedMs, entry.roundNumber)}
                  </span>
                  {entry.revertedAt ? <span className="ml-2 font-bold">Đã hoàn tác</span> : null}
                </li>
              )}
            />
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-100/60 p-4">
            <h3 className="font-black">Audit logs ({auditLogs.length})</h3>
            <HistoryList
              empty="Chưa có audit log."
              entries={auditLogs}
              renderEntry={(entry) => (
                <li className="rounded-lg bg-amber-50 p-3 text-sm" key={entry.id}>
                  <strong>{auditEventLabel(entry.eventType)}</strong> · {timestamp(entry.createdAt)}
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {metadataText(entry.metadata)}
                  </pre>
                </li>
              )}
            />
          </section>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose} type="button" variant="outline">
          Đóng
        </Button>
      </div>
    </Dialog>
  );
}
