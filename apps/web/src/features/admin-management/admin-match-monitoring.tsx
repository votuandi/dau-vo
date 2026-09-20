import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AthleteColor, MatchAccessRole, MatchStatus } from '@/types/shared';
import { formatDateTime, formatDateTimeWithSeconds, matchStatusLabels } from './presentation';
import { matchMonitoringQueryOptions } from './queries';

const roleLabels: Record<MatchAccessRole, string> = {
  [MatchAccessRole.REFEREE_1]: 'Trọng tài 1',
  [MatchAccessRole.REFEREE_2]: 'Trọng tài 2',
  [MatchAccessRole.REFEREE_3]: 'Trọng tài 3',
  [MatchAccessRole.INSPECTOR]: 'Giám định',
};

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function useDisplayTimer(endsAt: string | undefined, generatedAt: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);
  useEffect(() => {
    const current = Date.now();
    const source = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    offsetRef.current = Number.isNaN(source) ? 0 : source - current;
    setNow(current);
    if (!endsAt) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, generatedAt]);
  if (!endsAt) return '--:--';
  const end = new Date(endsAt).getTime();
  return Number.isNaN(end) ? '--:--' : formatRemaining(end - (now + offsetRef.current));
}

function colorLabel(color: AthleteColor | null): string {
  if (color === null) return '—';
  return color === AthleteColor.RED ? 'ĐỎ' : 'XANH';
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

function scoreEventHistoryClassName(color: AthleteColor | null): string {
  if (color === AthleteColor.RED) {
    return 'border border-red-200 bg-red-50 text-red-800';
  }
  if (color === AthleteColor.BLUE) {
    return 'border border-blue-200 bg-blue-50 text-blue-800';
  }
  return 'border border-slate-200 bg-slate-100 text-slate-800';
}

function scoreEventTypeLabel(type: string): string {
  switch (type) {
    case 'REFEREE_POINT':
      return 'Điểm trọng tài';
    case 'PENALTY':
      return 'Phạt';
    default:
      return type;
  }
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

export function AdminMatchMonitoring({ matchId }: { readonly matchId: string }) {
  const monitoring = useQuery(matchMonitoringQueryOptions(matchId));
  const snapshot = monitoring.data?.snapshot;
  const activeRound = snapshot?.activeRound;
  const running =
    snapshot?.match.phase === MatchStatus.ROUND_1_RUNNING ||
    snapshot?.match.phase === MatchStatus.ROUND_2_RUNNING;
  const paused =
    snapshot?.match.phase === MatchStatus.ROUND_1_PAUSED ||
    snapshot?.match.phase === MatchStatus.ROUND_2_PAUSED;
  const timer = useDisplayTimer(running ? activeRound?.endsAt : undefined, snapshot?.generatedAt);
  const displayedTimer =
    paused && activeRound?.remainingDurationMs != null
      ? `${String(Math.floor(activeRound.remainingDurationMs / 60_000)).padStart(2, '0')}:${String(Math.ceil(activeRound.remainingDurationMs / 1_000) % 60).padStart(2, '0')}`
      : timer;
  const red = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blue = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">Theo dõi trực tiếp</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tự làm mới mỗi 1,5 giây từ trạng thái authoritative của máy chủ.
          </p>
        </div>
        <span className="text-sm font-bold text-emerald-700">
          {monitoring.isFetching ? 'Đang đồng bộ…' : 'Đang theo dõi'}
        </span>
      </div>
      {monitoring.isError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Không thể tải dữ liệu giám sát.
        </p>
      ) : null}
      {snapshot ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Trạng thái</p>
              <p className="mt-2 font-black">{matchStatusLabels[snapshot.match.phase]}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Hiệp hiện tại</p>
              <p className="mt-2 font-black">{snapshot.match.currentRound ?? 'Chưa bắt đầu'}</p>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Thời gian</p>
              <p className="mt-2 font-mono text-2xl font-black">{displayedTimer}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4">
              <p className="font-black text-red-800">ĐỎ · {red?.name ?? '—'}</p>
              <p className="mt-2 text-3xl font-black">{red?.score ?? 0} điểm</p>
              <p className="text-sm font-semibold">{red?.violations ?? 0} lỗi</p>
            </div>
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
              <p className="font-black text-blue-800">XANH · {blue?.name ?? '—'}</p>
              <p className="mt-2 text-3xl font-black">{blue?.score ?? 0} điểm</p>
              <p className="text-sm font-semibold">{blue?.violations ?? 0} lỗi</p>
            </div>
          </div>
          <h3 className="mt-7 font-black">Hiện diện thiết bị</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {snapshot.presence.map((entry) => (
              <li
                className="flex items-center justify-between rounded-lg border p-3"
                key={entry.accessRole}
              >
                <span className="font-semibold">{roleLabels[entry.accessRole]}</span>
                <span
                  className={
                    entry.connected ? 'font-bold text-emerald-700' : 'font-bold text-slate-500'
                  }
                >
                  {entry.connected ? 'Đã kết nối' : 'Mất kết nối'}
                  {entry.connectedSocketCount > 1 ? ` (${String(entry.connectedSocketCount)})` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">Đang tải trạng thái trận đấu…</p>
      )}
      <div className="mt-8 grid gap-4">
        <details className="rounded-xl border p-4" open>
          <summary className="cursor-pointer font-black">
            Lịch sử cửa sổ chấm điểm ({monitoring.data?.scoringWindows.length ?? 0})
          </summary>
          <div className="mt-4 space-y-3">
            {monitoring.data?.scoringWindows.map((window) => (
              <article
                className={`rounded-lg p-3 ${scoringWindowHistoryClassName(window.scoreAwarded, window.winningColor)}`}
                data-testid={`scoring-window-${window.id}`}
                key={window.id}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-bold">
                    Hiệp {window.roundNumber} ·{' '}
                    {window.scoreAwarded && window.winningColor
                      ? `${colorLabel(window.winningColor)} +1`
                      : 'Không tính điểm'}
                    {window.invalidatedAt ? ' · Đã hủy kết quả' : ''}
                  </p>
                  <div className="text-right text-xs opacity-80">
                    <time className="block">{formatDateTimeWithSeconds(window.occurredAt)}</time>
                    <p className="mt-1">
                      {formatRoundElapsedTime(window.roundElapsedMs, window.roundNumber)}
                    </p>
                  </div>
                </div>
                <ul className="mt-2 text-sm">
                  {window.refereeVotes.map((vote) => (
                    <li key={vote.refereeSlot}>
                      {roleLabels[vote.refereeSlot as MatchAccessRole]} →{' '}
                      <strong>{colorLabel(vote.athleteColor)}</strong>{' '}
                      <span className="opacity-80">
                        {formatDateTimeWithSeconds(vote.serverReceivedAt)}
                      </span>
                      {vote.invalidatedAt ? (
                        <span className="ml-2 font-bold">Đã vô hiệu</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </article>
            )) ?? <p>Chưa có cửa sổ chấm điểm.</p>}
          </div>
        </details>
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-black">
            Lỗi phạt ({monitoring.data?.penalties.length ?? 0})
          </summary>
          <ul className="mt-4 space-y-2 text-sm">
            {monitoring.data?.penalties.map((penalty) => (
              <li className="rounded-lg bg-muted/60 p-3" key={penalty.id}>
                Hiệp {penalty.roundNumber ?? '—'} · {colorLabel(penalty.athlete.color)} ·{' '}
                {penalty.athlete.name} · <strong>{penalty.value}</strong> ·{' '}
                {formatDateTime(penalty.createdAt)}
                {penalty.revertedAt ? (
                  <span className="ml-2 font-bold text-amber-700">Đã hoàn tác</span>
                ) : null}
              </li>
            )) ?? <li>Chưa có lỗi phạt.</li>}
          </ul>
        </details>
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-black">
            Score events ({monitoring.data?.scoreEvents.length ?? 0})
          </summary>
          <ul className="mt-4 space-y-2 text-sm">
            {monitoring.data?.scoreEvents.map((event) => (
              <li
                className={`overflow-x-auto whitespace-nowrap rounded-lg p-3 ${scoreEventHistoryClassName(
                  event.athlete.color,
                )}`}
                data-testid={`score-event-${event.id}`}
                key={event.id}
              >
                {scoreEventTypeLabel(event.type)} · Hiệp {event.roundNumber ?? '—'} ·{' '}
                {colorLabel(event.athlete.color)} · {event.athlete.name} ·{' '}
                <strong>
                  {event.value > 0 ? '+' : ''}
                  {event.value}
                </strong>{' '}
                ·{' '}
                <time className="text-xs opacity-80">
                  {formatDateTimeWithSeconds(event.occurredAt)}
                </time>{' '}
                <span className="text-xs opacity-80">
                  · {formatRoundElapsedTime(event.roundElapsedMs, event.roundNumber)}
                </span>
                {event.revertedAt ? <span className="ml-2 font-bold">Đã hoàn tác</span> : null}
              </li>
            )) ?? <li>Chưa có score event.</li>}
          </ul>
        </details>
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-black">
            Audit logs ({monitoring.data?.auditLogs.length ?? 0})
          </summary>
          <ul className="mt-4 space-y-2 text-sm">
            {monitoring.data?.auditLogs.map((event) => (
              <li className="rounded-lg bg-muted/60 p-3" key={event.id}>
                <strong>{auditEventLabel(event.eventType)}</strong> ·{' '}
                {formatDateTime(event.createdAt)}
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {metadataText(event.metadata)}
                </pre>
              </li>
            )) ?? <li>Chưa có audit log.</li>}
          </ul>
        </details>
      </div>
    </section>
  );
}
