import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Radio, Swords, Trophy } from 'lucide-react';
import { tournamentApi } from '@/services/api/endpoints';
import { collectionItems } from '@/services/api/client';
import { queryKeys } from '@/services/api/query-keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageError, PageLoading } from '@/components/page-state';

export function AdminDashboardPage() {
  const query = useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: ({ signal }) => tournamentApi.list(signal),
  });
  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError onRetry={() => void query.refetch()} />;
  const tournaments = collectionItems(query.data);
  const active = tournaments.filter((item) => item.status === 'ACTIVE').length;
  const matches = tournaments.reduce((sum, item) => sum + item.matchCount, 0);

  return (
    <section>
      <p className="section-kicker">TRUNG TÂM ĐIỀU HÀNH</p>
      <h1 className="page-title">Tổng quan</h1>
      <p className="mt-1 text-sm text-muted-foreground">Theo dõi tình trạng giải và truy cập nhanh các trận đấu.</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Trophy} label="Tổng giải đấu" value={tournaments.length} />
        <Metric icon={Activity} label="Giải đang diễn ra" value={active} />
        <Metric icon={Swords} label="Tổng số trận" value={matches} />
        <Metric icon={Radio} label="Hạ tầng realtime" value="Sẵn sàng" />
      </div>
      <Card className="mt-7">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Giải đấu gần đây</CardTitle>
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-primary" to="/admin/tournaments">Xem tất cả <ArrowRight className="h-4 w-4" /></Link>
        </CardHeader>
        <CardContent className="grid gap-2">
          {tournaments.slice(0, 5).map((tournament) => (
            <Link className="flex items-center justify-between rounded-lg border p-4 transition hover:bg-muted" key={tournament.id} to={`/admin/tournaments/${tournament.id}`}>
              <div><p className="font-bold">{tournament.name}</p><p className="mt-1 text-xs text-muted-foreground">{tournament.location || 'Chưa có địa điểm'} · {tournament.matchCount} trận</p></div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
          {tournaments.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Chưa có giải đấu.</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: number | string }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-amber-400"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-black">{value}</p><p className="text-xs font-semibold text-muted-foreground">{label}</p></div></CardContent></Card>;
}
