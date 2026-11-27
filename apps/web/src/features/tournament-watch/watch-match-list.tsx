import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ClipboardList, Radio, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AthleteColor } from '@/types/shared';
import { inputClassName, selectClassName } from '@/features/admin-management/presentation';
import { matchVariantClassName } from '@/features/match-presentation';
import { scoreboardPath } from '@/features/scoreboard/scoreboard-view-model';
import type { WatchMatch, WatchMatchAthlete } from '@/services/api/watch';
import {
  EMPTY_WATCH_FILTER,
  filterWatchMatches,
  watchWeightClassOptions,
  type WatchMatchFilter,
} from './match-filter';
import {
  WATCH_MATCH_GROUPS,
  WATCH_MATCH_GROUP_LABEL,
  groupWatchMatches,
  watchMatchCode,
  watchMatchGroup,
  type WatchMatchGroup,
} from './match-order';
import { MANUAL_DECISION_LABEL } from './manual-decision';
import { watchMatchStatus } from './watch-match-status';
import { watchResultPath } from './watch-paths';

const GROUP_DOT: Record<WatchMatchGroup, string> = {
  live: 'bg-red-500 animate-pulse',
  finished: 'bg-emerald-500',
  upcoming: 'bg-slate-400',
};

/** One corner of a match: red on the left, blue mirrored on the right. */
function AthleteSide({
  athlete,
  color,
  isWinner,
}: {
  readonly athlete: WatchMatchAthlete | undefined;
  readonly color: AthleteColor;
  readonly isWinner: boolean;
}) {
  const red = color === AthleteColor.RED;
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', !red && 'flex-row-reverse text-right')}>
      {athlete?.imageUrl ? (
        <img
          alt=""
          className={cn(
            'size-10 shrink-0 rounded-full border-2 object-cover',
            red ? 'border-red-500' : 'border-blue-500',
          )}
          loading="lazy"
          src={athlete.imageUrl}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white',
            red ? 'bg-red-500' : 'bg-blue-500',
          )}
        >
          {athlete?.name.charAt(0).toUpperCase() ?? '?'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'flex items-center gap-1 font-semibold leading-tight',
            !red && 'flex-row-reverse',
            isWinner && 'font-bold',
          )}
        >
          <span className="sr-only">{red ? 'Giáp đỏ: ' : 'Giáp xanh: '}</span>
          <span className="truncate">{athlete?.name ?? 'Chưa xác định'}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {athlete?.organization ?? 'Chưa cập nhật đơn vị'}
        </p>
      </div>
    </div>
  );
}

const SCORE_SURFACE: Record<AthleteColor | 'none', string> = {
  [AthleteColor.RED]: 'bg-gradient-to-br from-red-600 to-red-800 text-white shadow-red-900/25',
  [AthleteColor.BLUE]: 'bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-900/25',
  none: 'bg-slate-700 text-white shadow-slate-900/20',
};

const cornerName = (color: AthleteColor) => (color === AthleteColor.RED ? 'giáp đỏ' : 'giáp xanh');

/** The score box takes the winner's corner colour, so the winner reads at a glance. */
function MatchScore({ match }: { readonly match: WatchMatch }) {
  if (!match.score && match.winnerColor)
    // A winner without a score was designated by the organiser.
    return (
      <span
        aria-label={`Chỉ định ${cornerName(match.winnerColor)} thắng`}
        className={cn(
          'whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold uppercase shadow-md',
          SCORE_SURFACE[match.winnerColor],
        )}
        role="img"
      >
        Chỉ định
      </span>
    );
  if (!match.score) return <span className="px-1 text-xs font-bold text-muted-foreground">VS</span>;
  const winner =
    match.winnerColor === AthleteColor.RED
      ? 'giáp đỏ thắng'
      : match.winnerColor === AthleteColor.BLUE
        ? 'giáp xanh thắng'
        : null;
  return (
    <span
      aria-label={`Tỉ số ${String(match.score.RED)} – ${String(match.score.BLUE)}${winner ? `, ${winner}` : ''}`}
      className={cn(
        'whitespace-nowrap rounded-lg px-3 py-1 text-lg font-black tabular-nums shadow-md',
        SCORE_SURFACE[match.winnerColor ?? 'none'],
      )}
      role="img"
    >
      {match.score.RED}
      <span className="mx-1 opacity-70">–</span>
      {match.score.BLUE}
    </span>
  );
}

/** Live matches are green, upcoming ones grey; finished ones fade in from the winner's side. */
function itemSurfaceClassName(match: WatchMatch, group: WatchMatchGroup): string {
  if (group === 'live')
    return 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/70';
  if (group === 'upcoming') return 'border-slate-200 bg-slate-50';
  if (match.winnerColor === AthleteColor.RED)
    return 'border-red-100 bg-gradient-to-r from-red-100/80 via-red-50/40 to-white';
  if (match.winnerColor === AthleteColor.BLUE)
    return 'border-blue-100 bg-gradient-to-l from-blue-100/80 via-blue-50/40 to-white';
  return 'border-border bg-white';
}

function WatchMatchItem({
  match,
  tournamentCode,
  expanded,
  onToggle,
}: {
  readonly match: WatchMatch;
  readonly tournamentCode: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const group = watchMatchGroup(match);
  const status = watchMatchStatus(match);
  // A fixture decided without a match has no scoreboard and no detailed result to open.
  const expandable = group !== 'upcoming' && match.kind === 'MATCH';
  const red = match.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blue = match.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);
  const detailsId = `watch-match-actions-${match.id}`;
  const context = [match.weightClass?.name, match.bracketRound?.label].filter(Boolean).join(' · ');

  const summary = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-bold',
            matchVariantClassName[status.variant],
          )}
          title={status.help}
        >
          {status.label}
        </span>
        <span className="font-mono text-xs font-semibold text-muted-foreground">
          Trận {watchMatchCode(match)}
        </span>
        {context ? <span className="text-xs text-muted-foreground">· {context}</span> : null}
        {expandable ? (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'ml-auto size-4 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <AthleteSide
          athlete={red}
          color={AthleteColor.RED}
          isWinner={match.winnerColor === AthleteColor.RED}
        />
        <MatchScore match={match} />
        <AthleteSide
          athlete={blue}
          color={AthleteColor.BLUE}
          isWinner={match.winnerColor === AthleteColor.BLUE}
        />
      </div>
      {match.manualDecision ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {MANUAL_DECISION_LABEL[match.manualDecision.type]}
          </span>
          {match.manualDecision.reason ? ` · Lý do: ${match.manualDecision.reason}` : null}
        </p>
      ) : null}
    </>
  );

  return (
    <li
      className={cn(
        // A column so every card fills its grid cell with equal height.
        'flex h-full flex-col rounded-xl border shadow-md shadow-slate-900/10 transition-shadow duration-200',
        itemSurfaceClassName(match, group),
        expandable && 'hover:shadow-lg hover:shadow-slate-900/15',
        expanded && 'ring-2 ring-primary/30',
      )}
    >
      {expandable ? (
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="flex w-full flex-1 cursor-pointer flex-col justify-between rounded-xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onToggle}
          type="button"
        >
          {summary}
        </button>
      ) : (
        <div className="flex flex-1 flex-col justify-between p-4">{summary}</div>
      )}
      {expandable && expanded ? (
        <div className="flex flex-wrap gap-2 border-t border-black/5 px-4 py-3" id={detailsId}>
          {group === 'live' ? (
            <Button asChild size="sm">
              <Link to={scoreboardPath(match.publicId)}>
                <Radio aria-hidden="true" className="size-4" />
                Xem trực tiếp
              </Link>
            </Button>
          ) : (
            <Button disabled size="sm" title="Trận đấu đã kết thúc" type="button">
              <Radio aria-hidden="true" className="size-4" />
              Xem trực tiếp
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to={watchResultPath(tournamentCode, match.publicId)}>
              <ClipboardList aria-hidden="true" className="size-4" />
              Kết quả chi tiết
            </Link>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function WatchMatchFilters({
  filter,
  onChange,
  weightClasses,
  counts,
}: {
  readonly filter: WatchMatchFilter;
  readonly onChange: (filter: WatchMatchFilter) => void;
  readonly weightClasses: readonly { readonly id: string; readonly name: string }[];
  readonly counts: Record<WatchMatchGroup, number>;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
      <div className="relative">
        <label className="sr-only" htmlFor="watch-match-search">
          Tìm kiếm trận đấu
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className={cn(inputClassName, 'mt-0 pl-9', filter.search && 'pr-9')}
          id="watch-match-search"
          onChange={(event) => {
            onChange({ ...filter, search: event.target.value });
          }}
          placeholder="Tìm theo tên VĐV, đơn vị hoặc mã trận"
          type="search"
          value={filter.search}
        />
        {filter.search ? (
          <button
            aria-label="Xoá từ khoá"
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => {
              onChange({ ...filter, search: '' });
            }}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      <label className="sr-only" htmlFor="watch-match-weight-class">
        Hạng cân
      </label>
      <select
        className={cn(selectClassName, 'mt-0')}
        id="watch-match-weight-class"
        onChange={(event) => {
          onChange({ ...filter, weightClassId: event.target.value });
        }}
        value={filter.weightClassId}
      >
        <option value="">Tất cả hạng cân</option>
        {weightClasses.map((weightClass) => (
          <option key={weightClass.id} value={weightClass.id}>
            {weightClass.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="watch-match-status">
        Trạng thái
      </label>
      <select
        className={cn(selectClassName, 'mt-0')}
        id="watch-match-status"
        onChange={(event) => {
          onChange({ ...filter, group: event.target.value as WatchMatchFilter['group'] });
        }}
        value={filter.group}
      >
        <option value="">Tất cả trạng thái</option>
        {WATCH_MATCH_GROUPS.map((group) => (
          <option key={group} value={group}>
            {WATCH_MATCH_GROUP_LABEL[group]} ({counts[group]})
          </option>
        ))}
      </select>
    </div>
  );
}

export function WatchMatchList({
  matches,
  tournamentCode,
}: {
  readonly matches: readonly WatchMatch[];
  readonly tournamentCode: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<WatchMatchFilter>(EMPTY_WATCH_FILTER);
  const weightClasses = useMemo(() => watchWeightClassOptions(matches), [matches]);
  const counts = useMemo(() => {
    const result: Record<WatchMatchGroup, number> = { live: 0, finished: 0, upcoming: 0 };
    for (const match of matches) result[watchMatchGroup(match)] += 1;
    return result;
  }, [matches]);
  const groups = useMemo(
    () => groupWatchMatches(filterWatchMatches(matches, filter)),
    [matches, filter],
  );

  if (matches.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        Giải đấu chưa có trận đấu nào.
      </p>
    );
  return (
    <div className="space-y-6">
      <WatchMatchFilters
        counts={counts}
        filter={filter}
        onChange={setFilter}
        weightClasses={weightClasses}
      />
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          <p>Không có trận đấu phù hợp với bộ lọc.</p>
          <Button
            className="mt-3"
            onClick={() => {
              setFilter(EMPTY_WATCH_FILTER);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Xoá bộ lọc
          </Button>
        </div>
      ) : null}
      {groups.map(({ group, matches: items }) => (
        <section aria-labelledby={`watch-group-${group}`} key={group}>
          <h3
            className="mb-3 flex items-center gap-2 text-sm font-bold text-muted-foreground"
            id={`watch-group-${group}`}
          >
            <span aria-hidden="true" className={cn('size-2 rounded-full', GROUP_DOT[group])} />
            {WATCH_MATCH_GROUP_LABEL[group]}
            <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{items.length}</span>
          </h3>
          <ul className="grid auto-rows-fr gap-3 md:grid-cols-2">
            {items.map((match) => (
              <WatchMatchItem
                expanded={expandedId === match.id}
                key={match.id}
                match={match}
                onToggle={() => {
                  setExpandedId((current) => (current === match.id ? null : match.id));
                }}
                tournamentCode={tournamentCode}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
