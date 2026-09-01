import { useState } from 'react';
import { AthleteColor, MatchStatus } from '@dau-vo/shared-types';
import { Flag, Play, TriangleAlert } from 'lucide-react';
import { MatchAccessPage } from '@/features/match-access/match-access-page';
import { useRealtimeMatch } from '@/features/realtime/realtime-match-provider';
import { useMatchClock } from '@/features/realtime/use-match-clock';
import { matchStatusLabels, errorMessages } from '@/i18n/vi';
import { ConnectionStatus } from '@/components/connection-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PageLoading } from '@/components/page-state';

type ConfirmAction = { kind: 'START'; label: string } | { kind: 'PENALTY'; color: AthleteColor; athleteName: string };

export function InspectorPage() { return <MatchAccessPage surface="INSPECTOR"><InspectorConsole /></MatchAccessPage>; }

function InspectorConsole() {
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const { snapshot, connection, clockOffsetMs, pendingCommand, lastError, startRound, addPenalty } = useRealtimeMatch();
  const clock = useMatchClock(snapshot, clockOffsetMs);
  if (!snapshot) return <div className="min-h-dvh bg-slate-950 text-white"><PageLoading label="Đang đồng bộ trận đấu…" /></div>;
  const connected = connection === 'CONNECTED';
  const running = snapshot.match.status === MatchStatus.ROUND_1_RUNNING || snapshot.match.status === MatchStatus.ROUND_2_RUNNING;
  const canStart = connected && !pendingCommand && (snapshot.match.status === MatchStatus.WAITING || snapshot.match.status === MatchStatus.BREAK);
  const canPenalize = connected && !pendingCommand && running;
  const startLabel = snapshot.match.status === MatchStatus.WAITING ? 'BẮT ĐẦU HIỆP 1' : snapshot.match.status === MatchStatus.BREAK ? 'BẮT ĐẦU HIỆP 2' : snapshot.match.status === MatchStatus.FINISHED ? 'TRẬN ĐẤU ĐÃ KẾT THÚC' : `${matchStatusLabels[snapshot.match.status].toUpperCase()} ĐANG DIỄN RA`;

  const execute = () => {
    if (!confirm) return;
    const action = confirm;
    setConfirm(null);
    if (action.kind === 'START') void startRound();
    else void addPenalty(action.color);
  };

  return <main className="min-h-dvh bg-slate-100 pb-5"><header className="bg-slate-950 px-4 py-5 pr-16 text-white md:px-8 md:pr-20"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div><p className="text-xs font-black tracking-[.2em] text-amber-400">GIÁM ĐỊNH · {snapshot.match.publicId}</p><h1 className="mt-1 text-lg font-bold">Điều hành trận đấu</h1></div><div className="text-center"><p className="text-xs font-bold text-white/60">{matchStatusLabels[snapshot.match.status].toUpperCase()}</p><p className="font-display text-5xl font-black tabular-nums md:text-6xl">{clock.formatted}</p></div><ConnectionStatus inverse phase={connection} /></div></header>{connection !== 'CONNECTED' ? <div className="bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-900">Các nút điều hành đã khóa cho đến khi đồng bộ lại.</div> : null}{lastError ? <div className="bg-red-100 px-4 py-2 text-center text-sm font-bold text-red-900">{errorMessages[lastError.code]}</div> : null}<div className="mx-auto grid max-w-6xl gap-5 p-4 md:p-6"><div className="grid gap-4 sm:grid-cols-2"><InspectorAthlete color={AthleteColor.RED} name={snapshot.red.name} organization={snapshot.red.organization} score={snapshot.red.score} violations={snapshot.red.violations} onPenalty={() => setConfirm({ kind: 'PENALTY', color: AthleteColor.RED, athleteName: snapshot.red.name })} disabled={!canPenalize} /><InspectorAthlete color={AthleteColor.BLUE} name={snapshot.blue.name} organization={snapshot.blue.organization} score={snapshot.blue.score} violations={snapshot.blue.violations} onPenalty={() => setConfirm({ kind: 'PENALTY', color: AthleteColor.BLUE, athleteName: snapshot.blue.name })} disabled={!canPenalize} /></div><Button className="h-20 text-xl font-black" disabled={!canStart} onClick={() => setConfirm({ kind: 'START', label: startLabel })} size="lg"><Play className="h-6 w-6 fill-current" />{pendingCommand?.kind === 'ROUND_START' ? 'ĐANG GỬI LỆNH…' : startLabel}</Button></div><Dialog onClose={() => setConfirm(null)} open={Boolean(confirm)} title={confirm?.kind === 'START' ? 'Xác nhận bắt đầu hiệp' : 'Xác nhận ghi phạm lỗi'} description={confirm?.kind === 'START' ? `Bắt đầu ${confirm.label.toLowerCase()} bằng thời gian chính thức của máy chủ?` : `Ghi một phạm lỗi và trừ 1 điểm của ${confirm?.athleteName}?`}><div className="flex justify-end gap-3"><Button onClick={() => setConfirm(null)} variant="outline">Hủy</Button><Button onClick={execute} variant={confirm?.kind === 'PENALTY' ? 'destructive' : 'default'}>Xác nhận</Button></div></Dialog></main>;
}

function InspectorAthlete({ color, name, organization, score, violations, disabled, onPenalty }: { color: AthleteColor; name: string; organization: string; score: number; violations: number; disabled: boolean; onPenalty: () => void }) {
  const red = color === AthleteColor.RED;
  return <Card className={red ? 'border-t-4 border-t-red-600' : 'border-t-4 border-t-blue-600'}><CardContent className="p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className={red ? 'text-xs font-black text-red-700' : 'text-xs font-black text-blue-700'}>{red ? 'VẬN ĐỘNG VIÊN ĐỎ' : 'VẬN ĐỘNG VIÊN XANH'}</p><h2 className="mt-2 text-xl font-black">{name}</h2><p className="text-sm text-muted-foreground">{organization}</p></div><p className="font-display text-7xl font-black tabular-nums">{score}</p></div><div className="mt-5 flex items-center justify-between border-t pt-4"><span className="flex items-center gap-2 text-sm font-bold"><TriangleAlert className="h-4 w-4 text-amber-600" /> {violations} phạm lỗi</span><Button disabled={disabled} onClick={onPenalty} variant={red ? 'red' : 'blue'}><Flag className="h-4 w-4" /> Ghi phạm lỗi</Button></div></CardContent></Card>;
}
