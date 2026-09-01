import { useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Expand, Radio, Trophy } from 'lucide-react';
import { MatchStatus } from '@dau-vo/shared-types';
import { publicApi } from '@/services/api/endpoints';
import { queryKeys } from '@/services/api/query-keys';
import { normalizePublicId } from '@/lib/utils';
import { matchStatusLabels } from '@/i18n/vi';
import { RealtimeMatchProvider, useRealtimeMatch } from '@/features/realtime/realtime-match-provider';
import { useMatchClock } from '@/features/realtime/use-match-clock';
import { ConnectionStatus } from '@/components/connection-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils';

export function ScoreboardPage() {
  const { publicId: pathId } = useParams();
  const [params, setParams] = useSearchParams();
  const selectedId = normalizePublicId(pathId ?? params.get('match') ?? '');
  const [input, setInput] = useState(selectedId);
  const snapshot = useQuery({
    queryKey: queryKeys.publicSnapshot(selectedId),
    queryFn: ({ signal }) => publicApi.snapshot(selectedId, signal),
    enabled: Boolean(selectedId),
    retry: 1,
  });

  if (!selectedId) {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (input) setParams({ match: input });
    };
    return <main className="scoreboard-background grid min-h-dvh place-items-center p-4"><Card className="w-full max-w-md border-white/10 bg-slate-950/90 text-white"><CardHeader className="text-center"><Trophy className="mx-auto h-11 w-11 text-amber-400" /><CardTitle className="text-2xl">Bảng điểm trực tiếp</CardTitle><CardDescription className="text-slate-400">Nhập mã trận đấu để mở bảng hiển thị.</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={submit}><Field autoCapitalize="characters" autoFocus label="Mã trận đấu" onChange={(event) => setInput(normalizePublicId(event.target.value))} placeholder="A72K9P" value={input} /><Button disabled={!input} size="lg" type="submit"><Radio className="h-4 w-4" /> Mở bảng điểm</Button></form></CardContent></Card></main>;
  }

  return <RealtimeMatchProvider audience="PUBLIC" initialSnapshot={snapshot.data ?? null} publicMatchId={selectedId}><ScoreboardDisplay bootstrapFailed={snapshot.isError} /></RealtimeMatchProvider>;
}

function ScoreboardDisplay({ bootstrapFailed }: { bootstrapFailed: boolean }) {
  const { snapshot, connection, clockOffsetMs, requestSnapshot } = useRealtimeMatch();
  const clock = useMatchClock(snapshot, clockOffsetMs);
  if (!snapshot) return <main className="grid min-h-dvh place-items-center bg-slate-950 p-6 text-center text-white"><div><Radio className="mx-auto h-10 w-10 animate-pulse text-amber-400" /><h1 className="mt-4 text-2xl font-black">Đang kết nối bảng điểm</h1><p className="mt-2 text-sm text-slate-400">{bootstrapFailed ? 'Chưa nhận được dữ liệu. Kiểm tra mã trận đấu hoặc kết nối.' : 'Đang lấy trạng thái chính thức từ máy chủ…'}</p>{bootstrapFailed ? <Button className="mt-5" onClick={requestSnapshot} variant="outline">Thử lại</Button> : null}</div></main>;
  const stale = connection !== 'CONNECTED';
  return <main className="scoreboard-shell relative flex min-h-dvh flex-col overflow-hidden bg-slate-950 text-white"><header className="relative z-10 grid min-h-[18dvh] grid-cols-[1fr_auto_1fr] items-center border-b border-white/10 bg-slate-950 px-[clamp(1rem,3vw,3rem)]"><div><p className="scoreboard-meta">TRẬN ĐẤU</p><p className="font-mono text-[clamp(.9rem,2vw,1.6rem)] font-black tracking-[.22em]">{snapshot.match.publicId}</p></div><div className="text-center"><p className="scoreboard-meta">{matchStatusLabels[snapshot.match.status].toUpperCase()}</p><p className="font-display text-[clamp(3.5rem,9vw,8.5rem)] font-black leading-none tabular-nums">{clock.formatted}</p></div><div className="justify-self-end text-right"><ConnectionStatus compact inverse phase={connection} /><button className="mt-2 flex items-center gap-1 text-xs text-white/50 hover:text-white" onClick={() => void document.documentElement.requestFullscreen?.()}><Expand className="h-3.5 w-3.5" /> Toàn màn hình</button></div></header>{stale ? <div className="absolute inset-x-0 top-[18dvh] z-20 bg-amber-400 px-3 py-1 text-center text-xs font-black text-slate-950">ĐANG KẾT NỐI LẠI · TIẾP TỤC HIỂN THỊ DỮ LIỆU GẦN NHẤT</div> : null}<section className="scoreboard-athletes flex-1"><ScoreboardAthlete color="red" name={snapshot.red.name} organization={snapshot.red.organization} score={snapshot.red.score} violations={snapshot.red.violations} /><ScoreboardAthlete color="blue" name={snapshot.blue.name} organization={snapshot.blue.organization} score={snapshot.blue.score} violations={snapshot.blue.violations} /></section>{clock.awaitingServerTransition && snapshot.match.status !== MatchStatus.FINISHED ? <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-xs font-bold">Đang đồng bộ trạng thái hiệp đấu…</div> : null}</main>;
}

function ScoreboardAthlete({ color, name, organization, score, violations }: { color: 'red' | 'blue'; name: string; organization: string; score: number; violations: number }) {
  const red = color === 'red';
  return <article className={cn('relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[clamp(1rem,4vw,4rem)] py-4 text-center', red ? 'scoreboard-red' : 'scoreboard-blue')}><p className="scoreboard-meta text-white/70">{red ? 'VẬN ĐỘNG VIÊN ĐỎ' : 'VẬN ĐỘNG VIÊN XANH'}</p><h2 className="mt-2 max-w-full text-balance font-display text-[clamp(2rem,5vw,5.5rem)] font-black uppercase leading-[.9]">{name}</h2><p className="mt-3 line-clamp-2 max-w-[40rem] text-[clamp(.75rem,1.6vw,1.35rem)] font-semibold text-white/70">{organization}</p><p className="font-display text-[clamp(8rem,24vw,23rem)] font-black leading-[.78] tabular-nums tracking-tighter">{score}</p><p className="mt-4 rounded-full bg-black/25 px-4 py-2 text-[clamp(.75rem,1.3vw,1.1rem)] font-black uppercase tracking-wider">Phạm lỗi: {violations}</p></article>;
}
