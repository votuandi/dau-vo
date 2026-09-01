import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowLeft, Copy, KeyRound, Radio, RefreshCw, ScrollText, ShieldAlert } from 'lucide-react';
import { AthleteColor, type MatchRole, type OneTimeAccessCode } from '@dau-vo/shared-types';
import { matchApi } from '@/services/api/endpoints';
import { collectionItems } from '@/services/api/client';
import { queryKeys } from '@/services/api/query-keys';
import { formatDateTime, cn } from '@/lib/utils';
import { matchStatusLabels, roleLabels } from '@/i18n/vi';
import { RealtimeMatchProvider, useRealtimeMatch } from '@/features/realtime/realtime-match-provider';
import { useMatchClock } from '@/features/realtime/use-match-clock';
import { ConnectionStatus } from '@/components/connection-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PageError, PageLoading } from '@/components/page-state';

const tabs = [
  ['overview', 'Tổng quan'],
  ['live', 'Theo dõi trực tiếp'],
  ['history', 'Lịch sử chấm điểm'],
  ['audit', 'Nhật ký'],
  ['access', 'Mã truy cập'],
] as const;

export function AdminMatchPage() {
  const { matchId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const currentTab = params.get('tab') ?? 'overview';
  const query = useQuery({
    queryKey: queryKeys.match(matchId),
    queryFn: ({ signal }) => matchApi.get(matchId, signal),
    enabled: Boolean(matchId),
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError || !query.data) return <PageError onRetry={() => void query.refetch()} />;
  const match = query.data;

  return (
    <section>
      <Link className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" to={`/admin/tournaments/${match.tournamentId}`}><ArrowLeft className="h-4 w-4" /> Quay lại giải đấu</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="flex items-center gap-3"><span className="font-mono text-sm font-black tracking-[.24em] text-muted-foreground">{match.publicId}</span><Badge>{matchStatusLabels[match.status]}</Badge></div><h1 className="page-title mt-2">{match.red.name} <span className="text-muted-foreground">vs</span> {match.blue.name}</h1><p className="mt-1 text-sm text-muted-foreground">{match.tournamentName ?? 'Chi tiết trận đấu'}</p></div>
        <a href={`/bang-diem?match=${match.publicId}`} rel="noreferrer" target="_blank"><Button variant="outline"><Radio className="h-4 w-4" /> Mở bảng điểm</Button></a>
      </div>
      <div className="mt-7 overflow-x-auto border-b"><nav className="flex min-w-max gap-1">{tabs.map(([value, label]) => <button className={cn('border-b-2 border-transparent px-4 py-3 text-sm font-bold text-muted-foreground', currentTab === value && 'border-primary text-foreground')} key={value} onClick={() => setParams({ tab: value })}>{label}</button>)}</nav></div>
      <div className="mt-6">
        {currentTab === 'overview' ? <Overview match={match} /> : null}
        {currentTab === 'live' ? <RealtimeMatchProvider audience="ADMIN" publicMatchId={match.publicId}><AdminLiveMonitor /></RealtimeMatchProvider> : null}
        {currentTab === 'history' ? <History matchId={match.id} /> : null}
        {currentTab === 'audit' ? <Audit matchId={match.id} /> : null}
        {currentTab === 'access' ? <AccessCodes matchId={match.id} /> : null}
      </div>
    </section>
  );
}

function Overview({ match }: { match: import('@/services/api/types').MatchDetail }) {
  const [editOpen, setEditOpen] = useState(false);
  return <><div className="grid gap-5 lg:grid-cols-[1fr_22rem]"><div className="grid gap-4 sm:grid-cols-2"><AthleteOverview color="red" name={match.red.name} organization={match.red.organization} score={match.red.score} violations={match.red.violations} /><AthleteOverview color="blue" name={match.blue.name} organization={match.blue.organization} score={match.blue.score} violations={match.blue.violations} /></div><Card><CardHeader><CardTitle>Cấu hình thời gian</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm"><Info label="Mỗi hiệp" value={`${Math.round((match.roundDurationMs ?? 120000) / 1000)} giây`} /><Info label="Giải lao" value={`${Math.round((match.breakDurationMs ?? 60000) / 1000)} giây`} /><Info label="Hiệp hiện tại" value={match.currentRound ? `Hiệp ${match.currentRound}` : '—'} /><Button className="mt-2" onClick={() => setEditOpen(true)} variant="outline">Chỉnh sửa cấu hình</Button></CardContent></Card></div><MatchEditDialog match={match} onClose={() => setEditOpen(false)} open={editOpen} /></>;
}

function AthleteOverview({ color, name, organization, score, violations }: { color: 'red' | 'blue'; name: string; organization: string; score: number; violations: number }) {
  return <Card className={color === 'red' ? 'border-t-4 border-t-red-600' : 'border-t-4 border-t-blue-600'}><CardContent className="p-6"><Badge tone={color}>{color === 'red' ? 'ĐỎ' : 'XANH'}</Badge><h2 className="mt-4 text-xl font-black">{name}</h2><p className="mt-1 text-sm text-muted-foreground">{organization}</p><div className="mt-6 flex items-end justify-between"><div><p className="text-xs font-bold text-muted-foreground">ĐIỂM</p><p className="font-display text-6xl font-black tabular-nums">{score}</p></div><p className="text-sm font-semibold">{violations} phạm lỗi</p></div></CardContent></Card>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b pb-3 last:border-0"><span className="text-muted-foreground">{label}</span><span className="font-bold">{value}</span></div>; }

function AdminLiveMonitor() {
  const { snapshot, connection, clockOffsetMs, requestSnapshot } = useRealtimeMatch();
  const clock = useMatchClock(snapshot, clockOffsetMs);
  if (!snapshot) return connection === 'DISCONNECTED' ? <PageError onRetry={requestSnapshot} /> : <PageLoading label="Đang kết nối trận đấu…" />;
  return <div className="grid gap-5 xl:grid-cols-[1fr_22rem]"><div><div className="mb-4 flex items-center justify-between rounded-xl bg-slate-950 p-5 text-white"><div><p className="text-xs font-bold tracking-widest text-amber-400">{matchStatusLabels[snapshot.match.status].toUpperCase()}</p><p className="font-display text-5xl font-black tabular-nums">{clock.formatted}</p></div><ConnectionStatus inverse phase={connection} /></div><div className="grid grid-cols-2 gap-4"><AthleteOverview color="red" name={snapshot.red.name} organization={snapshot.red.organization} score={snapshot.red.score} violations={snapshot.red.violations} /><AthleteOverview color="blue" name={snapshot.blue.name} organization={snapshot.blue.organization} score={snapshot.blue.score} violations={snapshot.blue.violations} /></div></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Hiện diện</CardTitle></CardHeader><CardContent className="grid gap-3">{(Object.keys(snapshot.presence) as MatchRole[]).map((role) => <div className="flex items-center justify-between rounded-lg border p-3" key={role}><span className="text-sm font-semibold">{roleLabels[role]}</span><Badge tone={snapshot.presence[role] ? 'success' : 'neutral'}>{snapshot.presence[role] ? 'Đã kết nối' : 'Mất kết nối'}</Badge></div>)}</CardContent></Card></div>;
}

function History({ matchId }: { matchId: string }) {
  const windows = useQuery({ queryKey: queryKeys.matchHistory(matchId, 'windows'), queryFn: ({ signal }) => matchApi.scoringWindows(matchId, signal) });
  const events = useQuery({ queryKey: queryKeys.matchHistory(matchId, 'events'), queryFn: ({ signal }) => matchApi.scoreEvents(matchId, signal) });
  const penalties = useQuery({ queryKey: queryKeys.matchHistory(matchId, 'penalties'), queryFn: ({ signal }) => matchApi.penalties(matchId, signal) });
  if (windows.isPending || events.isPending || penalties.isPending) return <PageLoading />;
  if (windows.isError || events.isError || penalties.isError) return <PageError onRetry={() => { void windows.refetch(); void events.refetch(); void penalties.refetch(); }} />;
  const items = collectionItems(windows.data);
  const scoreEvents = collectionItems(events.data);
  const penaltyItems = collectionItems(penalties.data);
  return <div className="grid gap-6"><section><h2 className="mb-3 text-lg font-black">Cửa sổ chấm điểm</h2><div className="grid gap-4">{items.map((window, index) => <Card key={window.id}><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-muted-foreground">HIỆP {window.roundNumber} · CỬA SỔ #{items.length - index}</p><p className="mt-1 text-sm">{formatDateTime(window.startedAt)} → {formatDateTime(window.endsAt)}</p></div><Badge tone={window.winningColor === AthleteColor.RED ? 'red' : window.winningColor === AthleteColor.BLUE ? 'blue' : 'neutral'}>{window.scoreAwarded ? `${window.winningColor === AthleteColor.RED ? 'ĐỎ' : 'XANH'} +1` : 'Không có điểm'}</Badge></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{window.votes.map((vote) => <div className="rounded-lg bg-muted p-3 text-sm" key={vote.id}><p className="font-bold">{roleLabels[vote.refereeSlot as MatchRole]}</p><p className={vote.athleteColor === AthleteColor.RED ? 'text-red-700' : 'text-blue-700'}>{vote.athleteColor === AthleteColor.RED ? 'ĐỎ' : 'XANH'} · {new Date(vote.serverReceivedAt).toLocaleTimeString('vi-VN', { fractionalSecondDigits: 3 })}</p></div>)}</div></CardContent></Card>)}{items.length === 0 ? <EmptyHistory /> : null}</div></section><div className="grid gap-5 lg:grid-cols-2"><HistoryList title="Sự kiện điểm" items={scoreEvents.map((item) => ({ id: item.id, label: `${item.athleteColor === AthleteColor.RED ? 'ĐỎ' : 'XANH'} ${item.value > 0 ? '+' : ''}${item.value}`, detail: `${item.type} · ${formatDateTime(item.createdAt)}` }))} /><HistoryList title="Phạm lỗi" items={penaltyItems.map((item) => ({ id: item.id, label: `${item.athleteColor === AthleteColor.RED ? 'ĐỎ' : 'XANH'} ${item.value}`, detail: `Hiệp ${item.roundNumber ?? '—'} · ${formatDateTime(item.createdAt)}` }))} /></div></div>;
}

function Audit({ matchId }: { matchId: string }) {
  const query = useQuery({ queryKey: queryKeys.matchHistory(matchId, 'audit'), queryFn: ({ signal }) => matchApi.audit(matchId, signal) });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError onRetry={() => void query.refetch()} />;
  const items = collectionItems(query.data);
  return <Card><CardContent className="divide-y p-0">{items.map((item) => <div className="flex gap-4 p-4" key={item.id}><span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted"><ScrollText className="h-4 w-4" /></span><div><p className="font-mono text-sm font-bold">{item.eventType}</p><p className="mt-1 text-xs text-muted-foreground">{item.actorType} · {formatDateTime(item.createdAt)}</p></div></div>)}{items.length === 0 ? <EmptyHistory /> : null}</CardContent></Card>;
}

function EmptyHistory() { return <div className="py-14 text-center"><ScrollText className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">Chưa có dữ liệu lịch sử.</p></div>; }

function HistoryList({ title, items }: { title: string; items: Array<{ id: string; label: string; detail: string }> }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="divide-y p-0">{items.map((item) => <div className="flex items-center justify-between gap-3 px-5 py-3" key={item.id}><span className="font-bold">{item.label}</span><span className="text-right text-xs text-muted-foreground">{item.detail}</span></div>)}{items.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</p> : null}</CardContent></Card>; }

function MatchEditDialog({ match, open, onClose }: { match: import('@/services/api/types').MatchDetail; open: boolean; onClose: () => void }) {
  const [redName, setRedName] = useState(match.red.name);
  const [redOrganization, setRedOrganization] = useState(match.red.organization);
  const [blueName, setBlueName] = useState(match.blue.name);
  const [blueOrganization, setBlueOrganization] = useState(match.blue.organization);
  const [roundSeconds, setRoundSeconds] = useState((match.roundDurationMs ?? 120_000) / 1_000);
  const [breakSeconds, setBreakSeconds] = useState((match.breakDurationMs ?? 60_000) / 1_000);
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => matchApi.update(match.id, { roundDurationMs: roundSeconds * 1_000, breakDurationMs: breakSeconds * 1_000, red: { name: redName.trim(), organization: redOrganization.trim() }, blue: { name: blueName.trim(), organization: blueOrganization.trim() } }), onSuccess: (value) => { queryClient.setQueryData(queryKeys.match(match.id), value); onClose(); } });
  return <Dialog description="Backend sẽ từ chối thay đổi không an toàn sau khi trận đã bắt đầu." onClose={onClose} open={open} title="Chỉnh sửa trận đấu"><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="grid gap-3 rounded-lg border-l-4 border-red-600 bg-red-50 p-4"><Field label="Vận động viên Đỏ" onChange={(event) => setRedName(event.target.value)} required value={redName} /><Field label="Đơn vị" onChange={(event) => setRedOrganization(event.target.value)} required value={redOrganization} /></div><div className="grid gap-3 rounded-lg border-l-4 border-blue-600 bg-blue-50 p-4"><Field label="Vận động viên Xanh" onChange={(event) => setBlueName(event.target.value)} required value={blueName} /><Field label="Đơn vị" onChange={(event) => setBlueOrganization(event.target.value)} required value={blueOrganization} /></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Mỗi hiệp (giây)" min={30} onChange={(event) => setRoundSeconds(Number(event.target.value))} type="number" value={roundSeconds} /><Field label="Giải lao (giây)" min={0} onChange={(event) => setBreakSeconds(Number(event.target.value))} type="number" value={breakSeconds} /></div><div className="flex justify-end gap-3"><Button onClick={onClose} variant="outline">Hủy</Button><Button disabled={mutation.isPending} type="submit">{mutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</Button></div></form></Dialog>;
}

function AccessCodes({ matchId }: { matchId: string }) {
  const [codes, setCodes] = useState<OneTimeAccessCode[] | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => matchApi.regenerateAccessCodes(matchId), onSuccess: (data) => { setCodes(data.accessCodes); void queryClient.invalidateQueries({ queryKey: queryKeys.match(matchId) }); } });
  return <><Card><CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-5 w-5" /> Mã truy cập trận đấu</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Mã gốc không được lưu dạng có thể đọc. Tạo lại sẽ thu hồi phiên đang dùng và chỉ hiển thị bộ mã mới một lần.</p></div><Button disabled={mutation.isPending} onClick={() => { if (window.confirm('Tạo lại toàn bộ mã truy cập? Các phiên cũ sẽ bị thu hồi.')) mutation.mutate(); }} variant="destructive"><RefreshCw className="h-4 w-4" /> Tạo lại mã</Button></CardContent></Card><Dialog dismissible={false} onClose={() => undefined} open={Boolean(codes)} title="Mã mới — chỉ hiển thị một lần" description="Lưu các mã trước khi đóng cửa sổ này.">{codes ? <div className="grid gap-2">{codes.map((item) => <div className="flex items-center justify-between rounded-lg border p-3" key={item.role}><span className="font-semibold">{roleLabels[item.role]}</span><Button onClick={() => void navigator.clipboard.writeText(item.code)} variant="outline"><span className="font-mono tracking-widest">{item.code}</span><Copy className="h-4 w-4" /></Button></div>)}<div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><ShieldAlert className="h-5 w-5 shrink-0" /> Việc đóng cửa sổ không thể hoàn tác.</div><Button className="mt-2" onClick={() => setCodes(null)}>Tôi đã lưu các mã</Button></div> : null}</Dialog></>;
}
