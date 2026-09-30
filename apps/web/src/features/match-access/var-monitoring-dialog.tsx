import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { officialAccessApi, type VarMonitoring } from '@/services/api/official-access';

function timestamp(value: unknown): string {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

function HistoryList({
  empty,
  entries,
  renderEntry,
}: {
  readonly empty: string;
  readonly entries: readonly Record<string, unknown>[];
  readonly renderEntry: (entry: Record<string, unknown>) => React.ReactNode;
}) {
  return entries.length ? <ul className="mt-3 space-y-2">{entries.map(renderEntry)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{empty}</p>;
}

export function VarMonitoringDialog({ matchId, onClose }: { readonly matchId: string; readonly onClose: () => void }) {
  const [data, setData] = useState<VarMonitoring | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    void officialAccessApi.varMonitoring(matchId).then(
      (result) => active && setData(result),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [matchId, retry]);

  return (
    <Dialog className="max-w-5xl" description="Dữ liệu chỉ đọc phục vụ kiểm tra VAR của trận đấu hiện tại." onClose={onClose} title="Check VAR">
      {failed ? (
        <div className="mt-5" role="alert">
          <p className="text-sm text-destructive">Không thể tải dữ liệu VAR.</p>
          <Button className="mt-3" onClick={() => setRetry((value) => value + 1)} type="button">Thử lại</Button>
        </div>
      ) : !data ? (
        <p className="mt-5 text-sm text-muted-foreground">Đang tải dữ liệu VAR…</p>
      ) : (
        <div className="mt-5 grid max-h-[70vh] gap-4 overflow-y-auto pr-1 md:grid-cols-2">
          <section className="rounded-xl border p-4"><h3 className="font-black">Lịch sử cửa sổ chấm điểm ({data.scoringWindows.length})</h3><HistoryList empty="Chưa có cửa sổ chấm điểm." entries={data.scoringWindows} renderEntry={(entry) => <li className="rounded-lg bg-muted p-3 text-sm" key={text(entry.id)}>Hiệp {text(entry.roundNumber)} · {entry.scoreAwarded ? `${text(entry.winningColor)} +1` : 'Không tính điểm'} · {timestamp(entry.occurredAt ?? entry.startedAt)}</li>} /></section>
          <section className="rounded-xl border p-4"><h3 className="font-black">Lỗi phạt ({data.penalties.length})</h3><HistoryList empty="Chưa có lỗi phạt." entries={data.penalties} renderEntry={(entry) => <li className="rounded-lg bg-muted p-3 text-sm" key={text(entry.id)}>Hiệp {text(entry.roundNumber)} · {text((entry.athlete as Record<string, unknown> | undefined)?.name)} · {text(entry.value)} · {timestamp(entry.createdAt)}</li>} /></section>
          <section className="rounded-xl border p-4"><h3 className="font-black">Score events ({data.scoreEvents.length})</h3><HistoryList empty="Chưa có score event." entries={data.scoreEvents} renderEntry={(entry) => <li className="rounded-lg bg-muted p-3 text-sm" key={text(entry.id)}>{text(entry.type)} · Hiệp {text(entry.roundNumber)} · {text((entry.athlete as Record<string, unknown> | undefined)?.name)} · {text(entry.value)} · {timestamp(entry.occurredAt ?? entry.createdAt)}</li>} /></section>
          <section className="rounded-xl border p-4"><h3 className="font-black">Audit logs ({data.auditLogs.length})</h3><HistoryList empty="Chưa có audit log." entries={data.auditLogs} renderEntry={(entry) => <li className="rounded-lg bg-muted p-3 text-sm" key={text(entry.id)}><strong>{text(entry.eventType)}</strong> · {timestamp(entry.createdAt)}<pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(entry.metadata ?? null)}</pre></li>} /></section>
        </div>
      )}
      <div className="mt-5 flex justify-end"><Button onClick={onClose} type="button" variant="outline">Đóng</Button></div>
    </Dialog>
  );
}
