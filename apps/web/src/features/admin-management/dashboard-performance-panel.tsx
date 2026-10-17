import { useState } from 'react';
import {
  Clock3,
  Flame,
  Medal,
  Target,
  Timer,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardScoreStats } from '@martial-arts-scoring/shared-types';
import type { AdminDashboardTournament } from '@/services/api/admin-management';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dashboardRoundLabels, summarizePerformance } from './dashboard-model';
import { DashboardStatCard } from './dashboard-stat-card';

const decimal = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const format = (value: number | null) => (value === null ? '—' : decimal.format(value));
const average = (stats: DashboardScoreStats) => (stats.count ? stats.sum / stats.count : null);
const panel =
  'dashboard-panel min-w-0 overflow-hidden rounded-2xl border border-indigo-100/80 bg-white p-5 shadow-sm sm:p-6';

function ScoreCell({ stats }: { readonly stats: DashboardScoreStats }) {
  return stats.count ? (
    <div className="whitespace-nowrap">
      <span className="font-bold tabular-nums">{format(average(stats))}</span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">
        {format(stats.min)}–{format(stats.max)}
      </span>
    </div>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export function DashboardPerformancePanel({
  tournaments,
}: {
  readonly tournaments: readonly AdminDashboardTournament[];
}) {
  const [page, setPage] = useState(0);
  const summary = summarizePerformance(tournaments);
  const pages = Math.max(1, Math.ceil(summary.matches.length / 6));
  const currentPage = Math.min(page, pages - 1);
  const maxScore = Math.max(1, ...summary.rounds.map(({ stats }) => stats.max ?? 0));
  const tournamentNames = new Map(
    tournaments.map((tournament) => [tournament.id, tournament.name]),
  );
  const minutes = summary.elapsedMs / 60_000;
  const overtimePercentage = summary.matches.length
    ? (summary.overtimeMatches / summary.matches.length) * 100
    : 0;

  return (
    <section aria-label="Thống kê điểm số và thời gian" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Chuyên môn & thời gian thi đấu</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Điểm số theo mỗi vận động viên · Cùng phạm vi giải đấu đã chọn
          </p>
        </div>
        <Badge tone="primary">{summary.publishedMatches} trận có điểm công bố</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label="Điểm trung bình / VĐV"
          value={format(average(summary.scores))}
          detail={`Kết quả đã công bố · ${String(summary.scores.count)} lượt VĐV`}
          icon={<Target aria-hidden="true" />}
          tone="violet"
        />
        <DashboardStatCard
          label="Điểm cao nhất / VĐV"
          value={format(summary.scores.max)}
          detail={`Thấp nhất: ${format(summary.scores.min)} điểm · Kết quả đã công bố`}
          icon={<Medal aria-hidden="true" />}
          tone="rose"
          index={1}
        />
        <DashboardStatCard
          label="Trận cần hiệp phụ"
          value={summary.overtimeMatches}
          detail={`${format(overtimePercentage)}% trong ${String(summary.matches.length)} trận đã bắt đầu`}
          icon={<Flame aria-hidden="true" />}
          tone="amber"
          index={2}
        />
        <DashboardStatCard
          label="Tổng phút thi đấu"
          value={format(minutes)}
          detail={`TB ${summary.timedMatches ? format(minutes / summary.timedMatches) : '—'} phút / trận có thời gian ghi nhận`}
          icon={<Timer aria-hidden="true" />}
          tone="emerald"
          index={3}
        />
      </div>

      <article className={panel}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold">Phân tích điểm theo hiệp</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Điểm giám định ở các hiệp đã kết thúc và còn hiệu lực. Điểm 0 vẫn được tính vào thống
              kê.
            </p>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
            <Target aria-hidden="true" className="size-5" />
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Điểm trung bình, thấp nhất và cao nhất theo hiệp</caption>
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="pb-3 pr-4 font-medium">Giai đoạn</th>
                <th className="min-w-32 px-3 pb-3 font-medium">Trung bình</th>
                <th className="px-3 pb-3 text-right font-medium">Thấp nhất</th>
                <th className="px-3 pb-3 text-right font-medium">Cao nhất</th>
                <th className="pb-3 pl-3 text-right font-medium">Lượt VĐV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-50">
              {summary.rounds.map(({ key, label, stats }, index) => (
                <tr key={key}>
                  <th scope="row" className="whitespace-nowrap py-4 pr-4 font-semibold">
                    {label}
                  </th>
                  <td className="px-3 py-4">
                    <span className="font-bold tabular-nums">{format(average(stats))}</span>
                    <div
                      aria-hidden="true"
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                    >
                      <div
                        className={cn(
                          'dashboard-bar h-full rounded-full bg-gradient-to-r',
                          index === 0
                            ? 'from-violet-400 to-indigo-600'
                            : index === 1
                              ? 'from-cyan-400 to-blue-600'
                              : 'from-orange-400 to-rose-500',
                        )}
                        style={{ width: `${String(((average(stats) ?? 0) / maxScore) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums text-muted-foreground">
                    {format(stats.min)}
                  </td>
                  <td className="px-3 py-4 text-right font-semibold tabular-nums">
                    {format(stats.max)}
                  </td>
                  <td className="py-4 pl-3 text-right tabular-nums text-muted-foreground">
                    {stats.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className={cn(panel, '!p-0')}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
          <div>
            <h3 className="font-bold">Điểm số từng trận</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Mỗi ô: điểm trung bình / VĐV, bên dưới là thấp nhất–cao nhất.
            </p>
          </div>
          <Clock3 aria-hidden="true" className="size-5 text-indigo-500" />
        </div>
        {summary.matches.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Điểm số trung bình, tối thiểu, tối đa từng hiệp và kết quả từng trận
                </caption>
                <thead className="border-y bg-indigo-50/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="min-w-44 px-5 py-3 font-medium sm:px-6">Trận đấu</th>
                    {Object.entries(dashboardRoundLabels).map(([key, label]) => (
                      <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">
                        {label}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-3 font-medium">Điểm công bố</th>
                    <th className="whitespace-nowrap px-5 py-3 text-right font-medium sm:px-6">
                      Phút thi đấu
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary.matches.slice(currentPage * 6, currentPage * 6 + 6).map((match) => (
                    <tr key={match.id} className="transition-colors hover:bg-indigo-50/40">
                      <th scope="row" className="max-w-64 px-5 py-4 font-normal sm:px-6">
                        <Link
                          className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                          to={`/admin/matches/${match.id}`}
                        >
                          #{match.publicId}
                          <ArrowUpRight aria-hidden="true" className="size-3.5" />
                        </Link>
                        <span className="mt-1 block text-xs">
                          {match.redName ?? 'Góc đỏ'}{' '}
                          <span className="text-muted-foreground">vs</span>{' '}
                          {match.blueName ?? 'Góc xanh'}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {tournamentNames.get(match.tournamentId)}
                        </span>
                        {match.needsOvertime ? (
                          <Badge tone="warning" className="mt-2 text-[10px]">
                            Có hiệp phụ
                          </Badge>
                        ) : null}
                      </th>
                      {(
                        Object.keys(dashboardRoundLabels) as (keyof typeof dashboardRoundLabels)[]
                      ).map((key) => (
                        <td key={key} className="px-3 py-4">
                          <ScoreCell stats={match.rounds[key]} />
                        </td>
                      ))}
                      <td className="px-3 py-4">
                        {match.score.count ? (
                          <ScoreCell stats={match.score} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {match.completed ? 'Chưa có dữ liệu điểm' : 'Chưa công bố'}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold tabular-nums sm:px-6">
                        {format(match.elapsedMs / 60_000)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">
              <span>
                Trang {currentPage + 1}/{pages} · {summary.matches.length} trận
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Trang trận trước"
                  title="Trang trận trước"
                  disabled={currentPage === 0}
                  onClick={() => {
                    setPage(currentPage - 1);
                  }}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Trang trận sau"
                  title="Trang trận sau"
                  disabled={currentPage + 1 >= pages}
                  onClick={() => {
                    setPage(currentPage + 1);
                  }}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="px-5 pb-8 text-center text-sm text-muted-foreground">
            Chưa có trận đã bắt đầu trong phạm vi đã chọn.
          </p>
        )}
        <div className="space-y-1 border-t bg-slate-50/70 px-5 py-4 text-[11px] leading-5 text-muted-foreground sm:px-6">
          <p>
            Điểm công bố là điểm của giai đoạn quyết định kết quả, đã gồm thưởng/phạt; không cộng
            điểm hiệp chính vào hiệp phụ.
          </p>
          <p>
            Thời gian cộng theo đồng hồ từng hiệp còn hiệu lực, gồm hiệp đang đấu; không tính thời
            gian nghỉ, tạm dừng và hiệp đã hủy. “—” nghĩa là chưa có điểm đã chốt.
          </p>
        </div>
      </article>
    </section>
  );
}
