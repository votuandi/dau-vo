import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AthleteColor } from '@/types/shared';
import { matchVariantClassName } from '@/features/match-presentation';
import { watchMatchStatus } from '@/features/tournament-watch/watch-match-status';
import { scoreboardPath } from '@/features/scoreboard/scoreboard-view-model';
import { watchMatchGroup } from '@/features/tournament-watch/match-order';
import { normalizeWatchCode, watchTournamentPath } from '@/features/tournament-watch/watch-paths';
import { watchQueryKeys } from '@/features/tournament-watch/watch-queries';
import { ApiClientError } from '@/services/api/client';
import { watchApi, type WatchMatchResult, type WatchOutcomeMethod } from '@/services/api/watch';

const REFRESH_MS = 5_000;
const CORNERS = [AthleteColor.RED, AthleteColor.BLUE] as const;

const OUTCOME_METHOD_LABEL: Record<WatchOutcomeMethod, string> = {
  REGULATION_SCORE: 'Thắng điểm sau các hiệp chính',
  OVERTIME_SCORE: 'Thắng điểm sau hiệp phụ',
  MANUAL_AFTER_OVERTIME_TIE: 'Quyết định sau khi hòa hiệp phụ',
  ADMIN_MANUAL: 'Quyết định của ban tổ chức',
};

const cornerLabel = (color: AthleteColor) => (color === AthleteColor.RED ? 'Giáp đỏ' : 'Giáp xanh');
const cornerText = (color: AthleteColor) =>
  color === AthleteColor.RED ? 'text-red-600' : 'text-blue-600';

function roundLabel(round: WatchMatchResult['rounds'][number]): string {
  const name = round.stage === 'OVERTIME' ? 'Hiệp phụ' : `Hiệp ${String(round.roundNumber)}`;
  return round.attemptNumber > 0 ? `${name} (lần ${String(round.attemptNumber + 1)})` : name;
}

function ResultContent({ data, code }: { readonly data: WatchMatchResult; readonly code: string }) {
  const { match, rounds, scoreSummary, outcome } = data;
  const group = watchMatchGroup(match);
  const status = watchMatchStatus(match);
  const athlete = (color: AthleteColor) => match.athletes.find((item) => item.color === color);
  const context = [match.weightClass?.name, match.bracketRound?.label].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-bold',
              matchVariantClassName[status.variant],
            )}
          >
            {status.label}
          </span>
          <span className="font-mono text-sm font-semibold text-muted-foreground">
            Trận {match.publicId}
          </span>
          {context ? <span className="text-sm text-muted-foreground">· {context}</span> : null}
        </div>
        <h1 className="text-2xl font-black sm:text-3xl">Kết quả chi tiết</h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Vận động viên">
        {CORNERS.map((color) => {
          const item = athlete(color);
          const isWinner = outcome?.winnerColor === color;
          const final = scoreSummary?.[color]?.finalScore ?? match.score?.[color] ?? null;
          return (
            <div
              className={cn(
                'flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm',
                isWinner ? 'border-amber-400 ring-2 ring-amber-200' : 'border-border',
                color === AthleteColor.RED
                  ? 'border-l-4 border-l-red-500'
                  : 'border-l-4 border-l-blue-500',
              )}
              key={color}
            >
              {item?.imageUrl ? (
                <img alt="" className="size-12 rounded-full object-cover" src={item.imageUrl} />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-bold uppercase', cornerText(color))}>
                  {cornerLabel(color)}
                </p>
                <p className="truncate text-lg font-bold">
                  {item?.name ?? 'Chưa xác định'}
                  {isWinner ? (
                    <Crown aria-label="Thắng" className="ml-1.5 inline size-5 text-amber-500" />
                  ) : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {item?.organization ?? 'Chưa cập nhật đơn vị'}
                </p>
              </div>
              <span className="text-3xl font-black tabular-nums">{final ?? '–'}</span>
            </div>
          );
        })}
      </section>

      {outcome ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <span className="font-bold">
            {athlete(outcome.winnerColor)?.name ?? cornerLabel(outcome.winnerColor)} thắng
          </span>{' '}
          · {OUTCOME_METHOD_LABEL[outcome.method]}
        </p>
      ) : group === 'live' ? (
        <p className="text-sm text-muted-foreground">
          Trận đang diễn ra, kết quả được cập nhật tự động.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Điểm theo hiệp</h2>
        {rounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có hiệp đấu nào được ghi nhận.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5" scope="col">
                    Hiệp
                  </th>
                  {CORNERS.map((color) => (
                    <th
                      className={cn('px-4 py-2.5 text-right', cornerText(color))}
                      key={color}
                      scope="col"
                    >
                      {cornerLabel(color)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rounds.map((round) => (
                  <tr
                    key={`${round.stage}-${String(round.roundNumber)}-${String(round.attemptNumber)}`}
                  >
                    <th className="px-4 py-2.5 text-left font-semibold" scope="row">
                      {roundLabel(round)}
                      {round.endedAt === null ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (đang diễn ra)
                        </span>
                      ) : null}
                    </th>
                    {CORNERS.map((color) => {
                      const result = round.results[color];
                      return (
                        <td className="px-4 py-2.5 text-right tabular-nums" key={color}>
                          {result ? (
                            <>
                              <span className="font-bold">{result.judgePoints}</span>
                              {result.faultCount > 0 ? (
                                <span className="ml-1.5 text-xs text-destructive">
                                  ({result.faultCount} lỗi)
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {scoreSummary ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            Điểm chính thức {scoreSummary.scope === 'OVERTIME' ? 'sau hiệp phụ' : ''}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5" scope="col">
                    Hạng mục
                  </th>
                  {CORNERS.map((color) => (
                    <th
                      className={cn('px-4 py-2.5 text-right', cornerText(color))}
                      key={color}
                      scope="col"
                    >
                      {cornerLabel(color)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(
                  [
                    ['Điểm giám định', 'baseScore'],
                    ['Điểm cộng', 'bonusPoints'],
                    ['Điểm trừ', 'penaltyPoints'],
                    ['Tổng điểm', 'finalScore'],
                  ] as const
                ).map(([label, key]) => (
                  <tr className={key === 'finalScore' ? 'font-bold' : undefined} key={key}>
                    <th className="px-4 py-2.5 text-left font-semibold" scope="row">
                      {label}
                    </th>
                    {CORNERS.map((color) => (
                      <td className="px-4 py-2.5 text-right tabular-nums" key={color}>
                        {scoreSummary[color]?.[key] ?? '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {group === 'live' ? (
          <Button asChild>
            <Link to={scoreboardPath(match.publicId)}>
              <Radio aria-hidden="true" className="size-4" />
              Xem trực tiếp
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link to={watchTournamentPath(code)}>Về danh sách trận đấu</Link>
        </Button>
      </div>
    </div>
  );
}

export function WatchMatchResultPage() {
  const params = useParams();
  const code = normalizeWatchCode(params.code ?? '');
  const matchPublicId = normalizeWatchCode(params.matchId ?? '');
  const query = useQuery({
    queryKey: watchQueryKeys.result(code, matchPublicId),
    queryFn: () => watchApi.matchResult(code, matchPublicId),
    enabled: Boolean(code && matchPublicId),
    // Keep refreshing only while the match can still change.
    refetchInterval: (current) =>
      current.state.data && watchMatchGroup(current.state.data.match) === 'live'
        ? REFRESH_MS
        : false,
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 2,
  });

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        to={watchTournamentPath(code)}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Danh sách trận đấu
      </Link>
      {query.isPending ? (
        <p className="text-muted-foreground">Đang tải kết quả…</p>
      ) : query.isError ? (
        <p
          className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-semibold text-destructive"
          role="alert"
        >
          {query.error instanceof ApiClientError && query.error.status === 404
            ? 'Không tìm thấy trận đấu trong giải này.'
            : 'Không thể tải kết quả trận đấu. Vui lòng thử lại.'}
        </p>
      ) : (
        <ResultContent code={code} data={query.data} />
      )}
    </section>
  );
}
