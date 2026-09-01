import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarDays, MapPin, Plus, Trophy } from 'lucide-react';
import { tournamentApi } from '@/services/api/endpoints';
import { collectionItems } from '@/services/api/client';
import { queryKeys } from '@/services/api/query-keys';
import type { TournamentInput } from '@/services/api/types';
import { tournamentStatusLabels } from '@/i18n/vi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { PageError, PageLoading } from '@/components/page-state';
import { TournamentForm } from './tournament-form';

export function TournamentListPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: ({ signal }) => tournamentApi.list(signal),
  });
  const create = useMutation({
    mutationFn: (input: TournamentInput) => tournamentApi.create(input),
    onSuccess: () => {
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) => tournamentApi.archive(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
  });

  if (query.isPending) return <PageLoading />;
  if (query.isError) return <PageError onRetry={() => void query.refetch()} />;
  const tournaments = collectionItems(query.data);

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-kicker">QUẢN LÝ THI ĐẤU</p>
          <h1 className="page-title">Giải đấu</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tạo giải, cấu hình trận đấu và theo dõi vận hành.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Tạo giải đấu
        </Button>
      </div>

      {tournaments.length === 0 ? (
        <Card className="border-dashed py-14 text-center">
          <CardContent>
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-bold">Chưa có giải đấu</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tạo giải đầu tiên để bắt đầu cấu hình trận.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tournaments.map((tournament) => (
            <Card className="group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md" key={tournament.id}>
              <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge tone={tournament.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {tournamentStatusLabels[tournament.status]}
                    </Badge>
                    <Link className="mt-3 block text-lg font-bold hover:text-primary" to={`/admin/tournaments/${tournament.id}`}>
                      {tournament.name}
                    </Link>
                  </div>
                  <Button
                    aria-label="Lưu trữ giải đấu"
                    disabled={archive.isPending}
                    onClick={() => {
                      if (window.confirm(`Lưu trữ giải “${tournament.name}”?`)) archive.mutate(tournament.id);
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {tournament.description || 'Không có mô tả.'}
                </p>
                <div className="mt-5 grid gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{tournament.location || 'Chưa xác định địa điểm'}</span>
                  <span className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />{tournament.startDate ? new Date(tournament.startDate).toLocaleDateString('vi-VN') : 'Chưa xác định ngày'}</span>
                </div>
                <div className="mt-5 border-t pt-4 text-sm font-semibold">{tournament.matchCount} trận đấu</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        description="Thông tin có thể chỉnh sửa sau."
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="Tạo giải đấu"
      >
        <TournamentForm
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => create.mutate(input)}
          pending={create.isPending}
          submitLabel="Tạo giải đấu"
        />
      </Dialog>
    </section>
  );
}
