import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/features/admin-management/presentation';
import {
  officialAccessApi,
  type AnnounceableTournamentResult,
} from '@/services/api/official-access';

const QUERY_KEY = ['official', 'tournament-results'] as const;

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * "Công bố Kết quả giải đấu": once a weight class's final has its official
 * result, the supervisor can switch every scoreboard of the tournament to the
 * podium of that weight class.
 */
export function TournamentResultsPanel() {
  const queryClient = useQueryClient();
  const results = useQuery({
    queryKey: QUERY_KEY,
    queryFn: officialAccessApi.tournamentResults,
    refetchInterval: 15_000,
    refetchOnMount: 'always',
  });
  const [pending, setPending] = useState<AnnounceableTournamentResult | null>(null);
  const announce = useMutation({
    mutationFn: (item: AnnounceableTournamentResult) =>
      officialAccessApi.announceTournamentResults(item.bracketId),
    onSuccess: (_data, item) => {
      setPending(null);
      toast({
        title: `Đã công bố kết quả giải đấu hạng cân ${item.weightClass.name}.`,
        variant: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => {
      toast({
        title: getApiErrorMessage(error, 'Không thể công bố kết quả giải đấu.'),
        variant: 'destructive',
      });
    },
  });

  const items = results.data?.results ?? [];
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="tournament-results-heading"
      className="mt-5 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm sm:p-5"
    >
      <h2
        className="flex items-center gap-2 text-lg font-black text-amber-900"
        id="tournament-results-heading"
      >
        <Trophy aria-hidden="true" className="size-5 text-amber-500" />
        Kết quả giải đấu
      </h2>
      <p className="mt-1 text-sm text-amber-900/80">
        Trận chung kết đã có kết quả. Công bố để mọi bảng điểm của giải chuyển sang màn hình Kết quả
        giải đấu.
      </p>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-3"
            key={item.bracketId}
          >
            <div className="min-w-0">
              <p className="font-bold">{item.weightClass.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                Vô địch: <span className="font-semibold text-foreground">{item.champion.name}</span>
                {item.champion.organization ? ` · ${item.champion.organization}` : ''}
              </p>
              {item.resultsAnnouncedAt ? (
                <p className="text-xs font-semibold text-emerald-700">
                  Đã công bố lúc {formatTime(item.resultsAnnouncedAt)}
                </p>
              ) : null}
            </div>
            <Button
              disabled={announce.isPending}
              onClick={() => {
                setPending(item);
              }}
              size="sm"
              type="button"
              variant={item.resultsAnnouncedAt ? 'outline' : 'default'}
            >
              <Trophy aria-hidden="true" className="size-4" />
              {item.resultsAnnouncedAt ? 'Công bố lại' : 'Công bố Kết quả giải đấu'}
            </Button>
          </li>
        ))}
      </ul>
      {pending ? (
        <ConfirmationDialog
          actionLabel="Công bố Kết quả giải đấu"
          busy={announce.isPending}
          description={`Tất cả bảng điểm của giải sẽ chuyển sang màn hình Kết quả giải đấu hạng cân ${pending.weightClass.name}.`}
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={() => {
            announce.mutate(pending);
          }}
          title="Công bố Kết quả giải đấu?"
        />
      ) : null}
    </section>
  );
}
