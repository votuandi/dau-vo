import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { publicViewApi } from '@/services/api/public-view';
import { authenticatedUserQueryOptions } from '@/features/auth/authenticated-user-session';

function Notice({ children }: { readonly children: ReactNode }) { return <section className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-sm">{children}</section>; }

export function TournamentsPage() {
  const query = useQuery({ queryKey: ['public', 'tournaments'], queryFn: publicViewApi.tournaments });
  if (query.isPending) return <Notice>Đang tải giải đấu…</Notice>;
  if (query.isError) return <Notice>Không thể tải danh sách giải đấu.</Notice>;
  if (query.data.items.length === 0) return <Notice>Chưa có giải đấu công khai.</Notice>;
  return <section className="mx-auto w-full max-w-3xl"><h1 className="text-3xl font-black">Giải đấu</h1><ul className="mt-6 space-y-3">{query.data.items.map((tournament) => <li className="rounded-xl border border-border bg-card p-4" key={tournament.id}><Link className="font-bold text-primary" to={`/tournaments/${tournament.id}`}>{tournament.name}</Link><p className="text-sm text-muted-foreground">{tournament.location ?? 'Chưa cập nhật địa điểm'}</p></li>)}</ul></section>;
}

export function TournamentPage() {
  const { id = '' } = useParams(); const query = useQuery({ queryKey: ['public', 'tournament', id], queryFn: () => publicViewApi.tournament(id), enabled: Boolean(id) });
  if (query.isPending) return <Notice>Đang tải giải đấu…</Notice>;
  if (query.isError) return <Notice>Không tìm thấy giải đấu.</Notice>;
  return <section className="mx-auto w-full max-w-3xl"><h1 className="text-3xl font-black">{query.data.tournament.name}</h1><p className="mt-2 text-muted-foreground">{query.data.tournament.description}</p><h2 className="mt-6 text-xl font-bold">Trận đấu</h2><ul className="mt-3 space-y-2">{query.data.tournament.matches.map((match) => <li key={match.id}><Link className="text-primary underline" to={`/matches/${match.id}`}>{match.publicId}</Link></li>)}</ul></section>;
}

export function MatchPage() {
  const { id = '' } = useParams(); const query = useQuery({ queryKey: ['public', 'match', id], queryFn: () => publicViewApi.match(id), enabled: Boolean(id) });
  if (query.isPending) return <Notice>Đang tải trận đấu…</Notice>;
  if (query.isError) return <Notice>Không tìm thấy trận đấu.</Notice>;
  return <Notice><h1 className="text-2xl font-black">Trận {query.data.match.publicId}</h1><p className="mt-2">{query.data.match.tournament.name}</p><ul className="mt-4">{query.data.match.athletes.map((athlete) => <li key={`${athlete.color}-${athlete.name}`}>{athlete.name} — {athlete.organization ?? 'Chưa cập nhật'}</li>)}</ul></Notice>;
}

export function AccountPage() {
  const query = useQuery(authenticatedUserQueryOptions);
  if (!query.data) return null;
  return <Notice><h1 className="text-2xl font-black">Tài khoản</h1><p className="mt-3">{query.data.user.fullName ?? query.data.user.username}</p><p className="text-sm text-muted-foreground">{query.data.user.username}</p></Notice>;
}
