import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, Plus, Swords } from 'lucide-react';
import type { MatchCreatedResponse } from '@dau-vo/shared-types';
import { matchApi, tournamentApi } from '@/services/api/endpoints';
import { collectionItems } from '@/services/api/client';
import { queryKeys } from '@/services/api/query-keys';
import type { MatchInput, TournamentInput } from '@/services/api/types';
import { matchStatusLabels, roleLabels } from '@/i18n/vi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PageError, PageLoading } from '@/components/page-state';
import { TournamentForm } from './tournament-form';

const defaultMatchInput: MatchInput = {
  roundDurationMs: 120_000,
  breakDurationMs: 60_000,
  red: { name: '', organization: '' },
  blue: { name: '', organization: '' },
};

export function TournamentDetailPage() {
  const { tournamentId = '' } = useParams();
  const [editOpen, setEditOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [created, setCreated] = useState<MatchCreatedResponse | null>(null);
  const queryClient = useQueryClient();
  const tournament = useQuery({
    queryKey: queryKeys.tournament(tournamentId),
    queryFn: ({ signal }) => tournamentApi.get(tournamentId, signal),
    enabled: Boolean(tournamentId),
  });
  const matches = useQuery({
    queryKey: queryKeys.tournamentMatches(tournamentId),
    queryFn: ({ signal }) => matchApi.listForTournament(tournamentId, signal),
    enabled: Boolean(tournamentId),
  });
  const update = useMutation({
    mutationFn: (input: TournamentInput) => tournamentApi.update(tournamentId, input),
    onSuccess: (value) => {
      queryClient.setQueryData(queryKeys.tournament(tournamentId), value);
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    },
  });
  const createMatch = useMutation({
    mutationFn: (input: MatchInput) => matchApi.create(tournamentId, input),
    onSuccess: (value) => {
      setMatchOpen(false);
      setCreated(value);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tournamentMatches(tournamentId) });
    },
  });

  if (tournament.isPending || matches.isPending) return <PageLoading />;
  if (tournament.isError || matches.isError || !tournament.data) {
    return <PageError onRetry={() => { void tournament.refetch(); void matches.refetch(); }} />;
  }
  const matchItems = collectionItems(matches.data);
  const initial: TournamentInput = {
    name: tournament.data.name,
    description: tournament.data.description ?? '',
    location: tournament.data.location ?? '',
    startDate: tournament.data.startDate ?? undefined,
    endDate: tournament.data.endDate ?? undefined,
    status: tournament.data.status,
  };

  return (
    <section>
      <Link className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" to="/admin/tournaments">
        <ArrowLeft className="h-4 w-4" /> Tất cả giải đấu
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone={tournament.data.status === 'ACTIVE' ? 'success' : 'neutral'}>{tournament.data.status}</Badge>
          <h1 className="page-title mt-2">{tournament.data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tournament.data.location || 'Chưa xác định địa điểm'}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditOpen(true)} variant="outline">Chỉnh sửa</Button>
          <Button onClick={() => setMatchOpen(true)}><Plus className="h-4 w-4" /> Tạo trận đấu</Button>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold">Trận đấu</h2>
        <span className="text-sm text-muted-foreground">{matchItems.length} trận</span>
      </div>
      {matchItems.length === 0 ? (
        <Card className="mt-4 border-dashed py-12 text-center"><CardContent><Swords className="mx-auto h-9 w-9 text-muted-foreground" /><h3 className="mt-3 font-bold">Chưa có trận đấu</h3></CardContent></Card>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {matchItems.map((match) => (
            <Link key={match.id} to={`/admin/matches/${match.id}`}>
              <Card className="transition hover:border-slate-400 hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between"><span className="font-mono text-lg font-black tracking-widest">{match.publicId}</span><Badge>{matchStatusLabels[match.status]}</Badge></div>
                  <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <AthleteMini tone="red" name={match.red.name} organization={match.red.organization} score={match.red.score} />
                    <span className="text-xs font-black text-muted-foreground">VS</span>
                    <AthleteMini tone="blue" name={match.blue.name} organization={match.blue.organization} score={match.blue.score} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog onClose={() => setEditOpen(false)} open={editOpen} title="Chỉnh sửa giải đấu">
        <TournamentForm initial={initial} onCancel={() => setEditOpen(false)} onSubmit={(input) => update.mutate(input)} pending={update.isPending} submitLabel="Lưu thay đổi" />
      </Dialog>
      <Dialog onClose={() => setMatchOpen(false)} open={matchOpen} title="Tạo trận đấu">
        <MatchCreationForm onCancel={() => setMatchOpen(false)} onSubmit={(input) => createMatch.mutate(input)} pending={createMatch.isPending} />
      </Dialog>
      <Dialog dismissible={false} onClose={() => undefined} open={Boolean(created)} title="Mã truy cập — chỉ hiển thị một lần" description="Sao chép và bàn giao an toàn. Các mã này sẽ không thể xem lại sau khi đóng.">
        {created ? (
          <div>
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">Mã trận đấu: <span className="font-mono text-base">{created.match.publicId}</span></div>
            <div className="grid gap-2">
              {created.accessCodes.map((item) => (
                <div className="flex items-center justify-between rounded-lg border p-3" key={item.role}>
                  <span className="text-sm font-semibold">{roleLabels[item.role]}</span>
                  <Button onClick={() => void navigator.clipboard.writeText(item.code)} variant="outline"><span className="font-mono tracking-widest">{item.code}</span><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-between gap-3"><Link className="inline-flex items-center gap-2 text-sm font-semibold" to={`/admin/matches/${created.match.id}`}><ExternalLink className="h-4 w-4" /> Mở trận đấu</Link><Button onClick={() => setCreated(null)}>Tôi đã lưu các mã</Button></div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

function AthleteMini({ tone, name, organization, score }: { tone: 'red' | 'blue'; name: string; organization: string; score: number }) {
  return <div className={tone === 'blue' ? 'text-right' : ''}><p className={tone === 'red' ? 'text-xs font-black text-red-700' : 'text-xs font-black text-blue-700'}>{tone === 'red' ? 'ĐỎ' : 'XANH'} · {score}</p><p className="mt-1 font-bold">{name}</p><p className="truncate text-xs text-muted-foreground">{organization}</p></div>;
}

function MatchCreationForm({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (input: MatchInput) => void }) {
  const [input, setInput] = useState(defaultMatchInput);
  const valid = useMemo(() => input.red.name.trim() && input.blue.name.trim() && input.red.organization.trim() && input.blue.organization.trim(), [input]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (valid) onSubmit(input); };
  const setAthlete = (color: 'red' | 'blue', field: 'name' | 'organization', value: string) => setInput((current) => ({ ...current, [color]: { ...current[color], [field]: value } }));
  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border-l-4 border-red-600 bg-red-50 p-4"><h3 className="mb-3 font-black text-red-800">VẬN ĐỘNG VIÊN ĐỎ</h3><div className="grid gap-3"><Field label="Họ và tên" onChange={(event) => setAthlete('red', 'name', event.target.value)} required value={input.red.name} /><Field label="Đơn vị" onChange={(event) => setAthlete('red', 'organization', event.target.value)} required value={input.red.organization} /></div></div>
        <div className="rounded-lg border-l-4 border-blue-600 bg-blue-50 p-4"><h3 className="mb-3 font-black text-blue-800">VẬN ĐỘNG VIÊN XANH</h3><div className="grid gap-3"><Field label="Họ và tên" onChange={(event) => setAthlete('blue', 'name', event.target.value)} required value={input.blue.name} /><Field label="Đơn vị" onChange={(event) => setAthlete('blue', 'organization', event.target.value)} required value={input.blue.organization} /></div></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Thời lượng hiệp (giây)" min={30} onChange={(event) => setInput((current) => ({ ...current, roundDurationMs: Number(event.target.value) * 1000 }))} type="number" value={input.roundDurationMs / 1000} /><Field label="Thời gian giải lao (giây)" min={0} onChange={(event) => setInput((current) => ({ ...current, breakDurationMs: Number(event.target.value) * 1000 }))} type="number" value={input.breakDurationMs / 1000} /></div>
      <div className="flex justify-end gap-3"><Button onClick={onCancel} variant="outline">Hủy</Button><Button disabled={pending || !valid} type="submit">{pending ? 'Đang tạo…' : 'Tạo trận đấu'}</Button></div>
    </form>
  );
}
