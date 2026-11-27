import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MapPin, Swords, Trophy } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { publicViewApi } from '@/services/api/public-view';

function TournamentLogo({ name, src }: { readonly name: string; readonly src: string | null }) {
  if (!src)
    return (
      <div
        aria-label={`Chưa có logo cho ${name}`}
        className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sky-50 text-xs font-bold text-primary ring-1 ring-sky-200/70"
        role="img"
      >
        <Trophy aria-hidden="true" className="size-6" />
      </div>
    );
  return (
    <img
      alt={`Logo ${name}`}
      className="size-14 shrink-0 rounded-2xl border border-border/80 bg-white object-contain p-1 shadow-sm"
      src={src}
    />
  );
}

function Notice({ children }: { readonly children: ReactNode }) {
  return <section className="app-card mx-auto w-full max-w-3xl p-8">{children}</section>;
}

export function TournamentsPage() {
  const query = useQuery({
    queryKey: ['public', 'tournaments'],
    queryFn: publicViewApi.tournaments,
  });
  if (query.isPending) return <Notice>Đang tải giải đấu…</Notice>;
  if (query.isError) return <Notice>Không thể tải danh sách giải đấu.</Notice>;
  if (query.data.items.length === 0) return <Notice>Chưa có giải đấu công khai.</Notice>;
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Giải đấu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh sách các giải đấu đang công khai trên hệ thống.
          </p>
        </div>
        <Badge tone="primary">{query.data.items.length} giải đấu</Badge>
      </header>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {query.data.items.map((tournament) => (
          <li className="app-card-interactive p-4" key={tournament.id}>
            <Link
              className="group flex items-center gap-3.5 focus-visible:outline-none"
              to={`/tournaments/${tournament.id}`}
            >
              <TournamentLogo name={tournament.name} src={tournament.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground transition-colors group-hover:text-primary">
                  {tournament.name}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-primary/90">{tournament.sport.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden="true" className="size-3" />
                    {tournament.location ?? 'Chưa cập nhật địa điểm'}
                  </span>
                </p>
              </div>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TournamentPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['public', 'tournament', id],
    queryFn: () => publicViewApi.tournament(id),
    enabled: Boolean(id),
  });
  if (query.isPending) return <Notice>Đang tải giải đấu…</Notice>;
  if (query.isError) return <Notice>Không tìm thấy giải đấu.</Notice>;
  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <div className="app-card p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <TournamentLogo name={query.data.tournament.name} src={query.data.tournament.imageUrl} />
          <div className="min-w-0">
            <Badge tone="primary">
              {query.data.tournament.sport.name} · {query.data.tournament.sport.sportGroup.name}
            </Badge>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              {query.data.tournament.name}
            </h1>
          </div>
        </div>
        {query.data.tournament.description ? (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {query.data.tournament.description}
          </p>
        ) : null}
      </div>

      <div className="app-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight">
            <Swords aria-hidden="true" className="size-5 text-primary" />
            Trận đấu
          </h2>
          <Badge tone="neutral">{query.data.tournament.matches.length} trận</Badge>
        </div>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {query.data.tournament.matches.map((match) => (
            <li key={match.id}>
              <Link
                className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-white/80 px-4 py-3 text-sm font-semibold transition-all hover:border-primary/40 hover:bg-sky-50/50 hover:text-primary"
                to={`/matches/${match.id}`}
              >
                <span>
                  <span className="font-mono font-bold text-primary">{match.publicId}</span>
                  {match.weightClass ? (
                    <span className="text-muted-foreground"> · {match.weightClass.name}</span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function MatchPage() {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: ['public', 'match', id],
    queryFn: () => publicViewApi.match(id),
    enabled: Boolean(id),
  });
  if (query.isPending) return <Notice>Đang tải trận đấu…</Notice>;
  if (query.isError) return <Notice>Không tìm thấy trận đấu.</Notice>;
  return (
    <Notice>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            {query.data.match.tournament.name}
          </p>
          <h1 className="mt-1 font-mono text-3xl font-black tracking-tight">
            Trận {query.data.match.publicId}
          </h1>
        </div>
        <Badge tone="primary">
          {query.data.match.weightClass?.name ?? 'Hạng cân chưa cập nhật'}
        </Badge>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {query.data.match.athletes.map((athlete) => (
          <li
            className={`flex items-center gap-3 rounded-2xl border border-border/80 border-l-4 bg-white/80 p-4 shadow-sm ${
              athlete.color === 'RED' ? 'border-l-red-600' : 'border-l-blue-600'
            }`}
            key={`${athlete.color}-${athlete.name}`}
          >
            {athlete.imageUrl ? (
              <img
                alt={athlete.name}
                className="size-12 shrink-0 rounded-full object-cover ring-2 ring-border"
                src={athlete.imageUrl}
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{athlete.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {athlete.organization ?? 'Chưa cập nhật'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
