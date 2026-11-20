import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ClipboardList, Crown, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AthleteColor } from '@/types/shared';
import { matchVariantClassName } from '@/features/match-presentation';
import { scoreboardPath } from '@/features/scoreboard/scoreboard-view-model';
import type { WatchMatch, WatchMatchAthlete } from '@/services/api/watch';
import {
  WATCH_MATCH_GROUP_LABEL,
  groupWatchMatches,
  watchMatchGroup,
  type WatchMatchGroup,
} from './match-order';
import { watchMatchStatus } from './watch-match-status';
import { watchResultPath } from './watch-paths';

const GROUP_DOT: Record<WatchMatchGroup, string> = {
  live: 'bg-red-500 animate-pulse',
  finished: 'bg-emerald-500',
  upcoming: 'bg-slate-400',
};

function AthleteRow({
  athlete,
  score,
  isWinner,
}: {
  readonly athlete: WatchMatchAthlete | undefined;
  readonly score: number | null;
  readonly isWinner: boolean;
}) {
  const red = athlete?.color === AthleteColor.RED;
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn('h-9 w-1 shrink-0 rounded-full', red ? 'bg-red-500' : 'bg-blue-500')}
      />
      {athlete?.imageUrl ? (
        <img
          alt=""
          className="size-9 shrink-0 rounded-full object-cover"
          loading="lazy"
          src={athlete.imageUrl}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white',
            red ? 'bg-red-500/80' : 'bg-blue-500/80',
          )}
        >
          {athlete?.name.charAt(0).toUpperCase() ?? '?'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-semibold', isWinner && 'font-bold')}>
          <span className="sr-only">{red ? 'Giáp đỏ: ' : 'Giáp xanh: '}</span>
          {athlete?.name ?? 'Chưa xác định'}
          {isWinner ? (
            <Crown aria-label="Thắng" className="ml-1.5 inline size-4 text-amber-500" />
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {athlete?.organization ?? 'Chưa cập nhật đơn vị'}
        </p>
      </div>
      {score === null ? null : (
        <span
          className={cn(
            'min-w-8 text-right text-xl font-black tabular-nums',
            isWinner ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
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
  const expandable = group !== 'upcoming';
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
          Trận {match.publicId}
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
      <div className="mt-3 space-y-2">
        <AthleteRow
          athlete={red}
          isWinner={match.winnerColor === AthleteColor.RED}
          score={match.score?.RED ?? null}
        />
        <AthleteRow
          athlete={blue}
          isWinner={match.winnerColor === AthleteColor.BLUE}
          score={match.score?.BLUE ?? null}
        />
      </div>
    </>
  );

  return (
    <li
      className={cn(
        'rounded-xl border bg-card shadow-sm transition-colors',
        expanded ? 'border-primary/40' : 'border-border',
      )}
    >
      {expandable ? (
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="w-full cursor-pointer rounded-xl p-4 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onToggle}
          type="button"
        >
          {summary}
        </button>
      ) : (
        <div className="p-4">{summary}</div>
      )}
      {expandable && expanded ? (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3" id={detailsId}>
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

export function WatchMatchList({
  matches,
  tournamentCode,
}: {
  readonly matches: readonly WatchMatch[];
  readonly tournamentCode: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const groups = groupWatchMatches(matches);
  if (groups.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        Giải đấu chưa có trận đấu nào.
      </p>
    );
  return (
    <div className="space-y-6">
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
          <ul className="space-y-3">
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
