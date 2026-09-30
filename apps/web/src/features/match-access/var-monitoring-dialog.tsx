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

function nullableAthlete(value: unknown): { color?: AthleteColor; name?: string } | null {
  return typeof value === 'object' && value !== null ? value : null;
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

function scoringWindowHistoryClassName(
  scoreAwarded: boolean,
  winningColor: AthleteColor | null,
): string {
  if (scoreAwarded && winningColor === AthleteColor.RED) {
    return 'border border-red-200 bg-red-50 text-red-800';
  }
  if (scoreAwarded && winningColor === AthleteColor.BLUE) {
    return 'border border-blue-200 bg-blue-50 text-blue-800';
  }
  return 'border border-slate-200 bg-slate-100 text-slate-800';
}

function judgeVoteColorClassName(color: AthleteColor): string {
  return color === AthleteColor.RED ? 'text-red-700' : 'text-blue-700';
}

function scoreEventHistoryClassName(color: AthleteColor | undefined): string {
  if (color === AthleteColor.RED) {
    return 'border border-red-200 bg-red-50 text-red-800';
  }
  if (color === AthleteColor.BLUE) {
    return 'border border-blue-200 bg-blue-50 text-blue-800';
  }
  return 'border border-slate-200 bg-slate-100 text-slate-800';
}

function scoreEventTypeLabel(type: string): string {
  if (type === 'REFEREE_POINT' || type === 'JUDGE_POINT') return 'Điểm giám định';
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
      className="!flex !h-[80vh] !max-h-[80vh] !w-[95vw] !max-w-[95vw] !flex-col !overflow-hidden border border-amber-300/60 bg-amber-50 text-amber-950"
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
        <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <details className="rounded-xl border p-4" open>
            <summary className="cursor-pointer font-black">
              Lịch sử cửa sổ chấm điểm ({scoringWindows.length})
            </summary>
            <HistoryList
              empty="Chưa có cửa sổ chấm điểm."
              entries={scoringWindows}
              renderEntry={(entry) => (
                <li
                  className={`rounded-lg p-3 text-sm ${scoringWindowHistoryClassName(
                    entry.scoreAwarded,
                    entry.winningColor,
                  )}`}
                  key={entry.id}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-bold">
                      Hiệp {entry.roundNumber} ·{' '}
                      {entry.scoreAwarded && entry.winningColor
                        ? `${colorLabel(entry.winningColor)} +1`
                        : 'Không tính điểm'}
                      {entry.invalidatedAt ? ' · Đã hủy kết quả' : ''}
                    </p>
                    <div className="text-right text-xs opacity-80">
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
                          <strong className={judgeVoteColorClassName(vote.athleteColor)}>
                            +1 {athleteColorLabel(vote.athleteColor)}
                          </strong>{' '}
                          <span className="opacity-80">[{timestamp(vote.serverReceivedAt)}]</span>
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
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-black">Lỗi phạt ({penalties.length})</summary>
            <HistoryList
              empty="Chưa có lỗi phạt."
              entries={penalties}
              renderEntry={(entry) => {
                const athlete = nullableAthlete(entry.athlete);
                return (
                  <li className="rounded-lg bg-muted/60 p-3 text-sm" key={entry.id}>
                    Hiệp {entry.roundNumber ?? '—'} · {colorLabel(athlete?.color)} ·{' '}
                    {athlete?.name ?? '—'} · <strong>{entry.value}</strong> ·{' '}
                    {timestamp(entry.createdAt)}
                    {entry.revertedAt ? <span className="ml-2 font-bold">Đã hoàn tác</span> : null}
                  </li>
                );
              }}
            />
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-black">
              Score events ({scoreEvents.length})
            </summary>
            <HistoryList
              empty="Chưa có score event."
              entries={scoreEvents}
              renderEntry={(entry) => {
                const athlete = nullableAthlete(entry.athlete);
                return (
                  <li
                    className={`overflow-x-auto whitespace-nowrap rounded-lg p-3 text-sm ${scoreEventHistoryClassName(
                      athlete?.color,
                    )}`}
                    key={entry.id}
                  >
                    {scoreEventTypeLabel(entry.type)} · Hiệp {entry.roundNumber ?? '—'} ·{' '}
                    {colorLabel(athlete?.color)} · {athlete?.name ?? '—'} ·{' '}
                    <strong>
                      {entry.value > 0 ? '+' : ''}
                      {entry.value}
                    </strong>{' '}
                    · {timestamp(entry.occurredAt)}
                    <span className="text-xs opacity-80">
                      {' '}
                      · {formatRoundElapsedTime(entry.roundElapsedMs, entry.roundNumber)}
                    </span>
                    {entry.revertedAt ? <span className="ml-2 font-bold">Đã hoàn tác</span> : null}
                  </li>
                );
              }}
            />
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-black">Audit logs ({auditLogs.length})</summary>
            <HistoryList
              empty="Chưa có audit log."
              entries={auditLogs}
              renderEntry={(entry) => (
                <li className="rounded-lg bg-muted/60 p-3 text-sm" key={entry.id}>
                  <strong>{auditEventLabel(entry.eventType)}</strong> · {timestamp(entry.createdAt)}
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {metadataText(entry.metadata)}
                  </pre>
                </li>
              )}
            />
          </details>
        </div>
      )}
      <div className="mt-5 flex shrink-0 justify-end pt-5">
        <Button onClick={onClose} type="button" variant="outline">
          Đóng
        </Button>
      </div>
    </Dialog>
  );
}
