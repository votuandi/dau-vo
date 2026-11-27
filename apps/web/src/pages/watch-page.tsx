import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarDays, GitFork, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { underlineListClassName, underlineTriggerClassName } from '@/components/ui/tab-styles';
import { inputClassName } from '@/features/admin-management/presentation';
import { WatchBracketView } from '@/features/tournament-watch/watch-bracket-view';
import { WatchMatchList } from '@/features/tournament-watch/watch-match-list';
import { WatchSponsorStrip } from '@/features/tournament-watch/watch-sponsor-strip';
import { normalizeWatchCode, watchTournamentPath } from '@/features/tournament-watch/watch-paths';
import { watchQueryKeys } from '@/features/tournament-watch/watch-queries';
import { WatchErrorMessage } from '@/features/tournament-watch/watch-error-message';
import { retryWatchQuery } from '@/features/tournament-watch/watch-errors';
import { watchApi, type WatchTournament } from '@/services/api/watch';

type WatchTab = 'matches' | 'bracket';
const TABS: readonly {
  readonly id: WatchTab;
  readonly label: string;
  readonly icon: typeof GitFork;
}[] = [
  { id: 'matches', label: 'Danh sách trận đấu', icon: CalendarDays },
  { id: 'bracket', label: 'Sơ đồ nhánh đấu', icon: GitFork },
];

function formatDate(value: string | null): string | null {
  return value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'UTC' }) : null;
}

function TournamentSummary({ tournament }: { readonly tournament: WatchTournament }) {
  const dates = [formatDate(tournament.startDate), formatDate(tournament.endDate)]
    .filter(Boolean)
    .join(' – ');
  return (
    <div className="flex items-center gap-4">
      {tournament.imageUrl ? (
        <img
          alt={`Logo ${tournament.name}`}
          className="size-16 shrink-0 rounded-xl border border-border bg-white object-contain"
          src={tournament.imageUrl}
        />
      ) : null}
      <div className="min-w-0">
        <h2 className="text-2xl font-black leading-tight sm:text-3xl">{tournament.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{tournament.sport.name}</span>
          {tournament.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5" />
              {tournament.location}
            </span>
          ) : null}
          {dates ? <span>{dates}</span> : null}
        </p>
      </div>
    </div>
  );
}

function WatchTabs({
  selected,
  onSelect,
}: {
  readonly selected: WatchTab;
  readonly onSelect: (tab: WatchTab) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="overflow-x-auto">
      <div aria-label="Nội dung giải đấu" className={underlineListClassName} role="tablist">
        {TABS.map((tab, index) => {
          const active = tab.id === selected;
          const Icon = tab.icon;
          return (
            <button
              aria-controls={`watch-panel-${tab.id}`}
              aria-selected={active}
              className={underlineTriggerClassName(active)}
              id={`watch-tab-${tab.id}`}
              key={tab.id}
              onClick={() => {
                onSelect(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = (index + 1) % TABS.length;
                const target = TABS[next];
                if (target) onSelect(target.id);
                refs.current[next]?.focus();
              }}
              ref={(element) => {
                refs.current[index] = element;
              }}
              role="tab"
              tabIndex={active ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WatchTournament({ code }: { readonly code: string }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: WatchTab = params.get('tab') === 'bracket' ? 'bracket' : 'matches';
  const query = useQuery({
    queryKey: watchQueryKeys.overview(code),
    queryFn: () => watchApi.overview(code),
    retry: retryWatchQuery,
  });
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: watchQueryKeys.brackets(code) }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  if (query.isPending) return <p className="text-muted-foreground">Đang tìm giải đấu…</p>;
  if (query.isError)
    return (
      <WatchErrorMessage
        error={query.error}
        fallbackMessage="Không thể tải giải đấu. Vui lòng thử lại."
        notFoundMessage={`Không tìm thấy giải đấu có mã “${code}”. Vui lòng kiểm tra lại.`}
      />
    );

  const isUpdating = refreshing || query.isFetching;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TournamentSummary tournament={query.data.tournament} />
        <Button
          className="shrink-0 self-start sm:self-center"
          disabled={isUpdating}
          onClick={() => void handleRefresh()}
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className={isUpdating ? 'size-4 animate-spin' : 'size-4'} />
          {isUpdating ? 'Đang cập nhật…' : 'Cập nhật kết quả'}
        </Button>
      </div>
      <WatchSponsorStrip sponsors={query.data.sponsors ?? []} />
      <WatchTabs
        onSelect={(next) => {
          setParams(next === 'bracket' ? { tab: 'bracket' } : {}, { replace: true });
        }}
        selected={tab}
      />
      <div aria-labelledby={`watch-tab-${tab}`} id={`watch-panel-${tab}`} role="tabpanel">
        {tab === 'matches' ? (
          <WatchMatchList matches={query.data.matches} tournamentCode={code} />
        ) : (
          <WatchBracketView tournamentCode={code} />
        )}
      </div>
    </div>
  );
}

export function WatchPage() {
  const { code: rawCode = '' } = useParams();
  const code = normalizeWatchCode(rawCode);
  const navigate = useNavigate();
  const [draft, setDraft] = useState(code);
  useEffect(() => {
    setDraft(code);
  }, [code]);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = normalizeWatchCode(draft);
    if (!next) return;
    void navigate(watchTournamentPath(next));
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-black">Theo dõi giải đấu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập mã giải đấu do ban tổ chức cung cấp để xem lịch thi đấu, kết quả và sơ đồ nhánh
            đấu.
          </p>
        </div>
        <form className="flex max-w-xl gap-2" onSubmit={submit}>
          <label className="sr-only" htmlFor="watch-tournament-code">
            Mã giải đấu
          </label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            className={`${inputClassName} mt-0 font-mono uppercase tracking-widest`}
            id="watch-tournament-code"
            maxLength={32}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            placeholder="Mã giải đấu"
            spellCheck={false}
            value={draft}
          />
          <Button className="h-11 min-w-20" disabled={!normalizeWatchCode(draft)} type="submit">
            OK
          </Button>
        </form>
      </div>
      {code ? <WatchTournament code={code} key={code} /> : null}
    </section>
  );
}
