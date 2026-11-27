import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown } from 'lucide-react';
import { TabScroller } from '@/components/ui/tabs';
import { chipListClassName, chipTriggerClassName } from '@/components/ui/tab-styles';
import { BracketChart } from '@/features/tournament-bracket/bracket-chart';
import { BracketZoomControls } from '@/features/tournament-bracket/bracket-zoom-controls';
import { watchApi } from '@/services/api/watch';
import { watchQueryKeys } from './watch-queries';

export function WatchBracketView({ tournamentCode }: { readonly tournamentCode: string }) {
  const query = useQuery({
    queryKey: watchQueryKeys.brackets(tournamentCode),
    queryFn: () => watchApi.brackets(tournamentCode),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  if (query.isPending) return <p className="text-muted-foreground">Đang tải sơ đồ nhánh đấu…</p>;
  if (query.isError)
    return <p className="text-destructive">Không thể tải sơ đồ nhánh đấu. Vui lòng thử lại.</p>;

  const drawn = query.data.weightClasses.filter((item) => item.bracket !== null);
  if (drawn.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        Giải đấu chưa có sơ đồ nhánh đấu.
      </p>
    );
  const selected = drawn.find((item) => item.id === selectedId) ?? drawn[0];
  const bracket = selected?.bracket;

  return (
    <div className="space-y-4">
      <TabScroller>
        <div aria-label="Hạng cân" className={chipListClassName} role="tablist">
          {drawn.map((item) => {
            const active = item.id === selected?.id;
            return (
              <button
                aria-selected={active}
                className={chipTriggerClassName(active)}
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                }}
                role="tab"
                type="button"
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </TabScroller>
      {bracket ? (
        <section
          aria-label={`Sơ đồ nhánh đấu ${selected.name}`}
          className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {bracket.bracket.athleteCount} vận động viên · {bracket.bracket.roundCount} vòng
              {bracket.bracket.championEntrant ? (
                <span className="ml-2 inline-flex items-center gap-1 font-semibold text-foreground">
                  <Crown aria-hidden="true" className="size-4 text-amber-500" />
                  Vô địch: {bracket.bracket.championEntrant.snapshotName}
                </span>
              ) : null}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs tabular-nums text-muted-foreground">{zoomPercent}%</span>
              <BracketZoomControls onChange={setZoomPercent} zoomPercent={zoomPercent} />
            </div>
          </div>
          <BracketChart data={bracket} decisionDisabled zoomPercent={zoomPercent} />
        </section>
      ) : null}
    </div>
  );
}
