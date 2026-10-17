import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminManagementApi } from '@/services/api/admin-management';
import { cn } from '@/lib/utils';
import { TournamentStatus } from '@/types/shared';
import { TournamentStatusBadge } from './tournament-status-badge';
import { DashboardStatCard as StatCard } from './dashboard-stat-card';
import { DashboardPerformancePanel } from './dashboard-performance-panel';
import { formatDate } from './presentation';
import {
  completionPercent,
  matchSegments,
  summarizeDashboard,
  totalMatches,
} from './dashboard-model';

const number = new Intl.NumberFormat('vi-VN');
const panelClassName =
  'dashboard-panel min-w-0 rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/30 p-5 shadow-sm sm:p-6';

export function DashboardOverview() {
  const [scope, setScope] = useState('all');
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: adminManagementApi.getDashboard,
    refetchInterval: 30_000,
  });
  const allTournaments = query.data?.tournaments ?? [];
  const selectedScope = allTournaments.some((tournament) => tournament.id === scope)
    ? scope
    : 'all';
  const tournaments = allTournaments.filter(
    (tournament) => selectedScope === 'all' || tournament.id === selectedScope,
  );
  const summary = summarizeDashboard(tournaments);
  const completed = completionPercent(summary.matches.COMPLETED, summary.totalMatches);
  const sorted = [...tournaments].sort(
    (a, b) =>
      Number(b.status === TournamentStatus.ACTIVE) - Number(a.status === TournamentStatus.ACTIVE) ||
      b.matches.IN_PROGRESS - a.matches.IN_PROGRESS,
  );
  const chartTournaments = sorted.filter((tournament) => totalMatches(tournament) > 0).slice(0, 5);
  const maxMatches = Math.max(1, ...chartTournaments.map(totalMatches));
  const pageCount = Math.max(1, Math.ceil(sorted.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  let donutOffset = 0;

  return (
    <section aria-label="Thống kê quản trị" className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Tổng quan vận hành</h2>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                query.isError ? 'bg-amber-500' : 'bg-emerald-500',
              )}
            />
            {query.dataUpdatedAt
              ? `Cập nhật ${new Date(query.dataUpdatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · Tự làm mới mỗi 30 giây`
              : query.isPending
                ? 'Đang tải thống kê'
                : 'Chưa có dữ liệu thống kê'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Lọc thống kê theo giải đấu"
            className="form-select min-h-10 w-full min-w-0 rounded-lg border bg-card py-2 pl-3 pr-9 text-sm font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-64"
            value={selectedScope}
            disabled={query.isPending || !allTournaments.length}
            onChange={(event) => {
              setScope(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">Tất cả giải đấu</option>
            {allTournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name}
              </option>
            ))}
          </select>
          <Button
            aria-label="Làm mới thống kê"
            className="shrink-0"
            title="Làm mới thống kê"
            disabled={query.isFetching}
            onClick={() => {
              void query.refetch();
            }}
            size="icon"
            variant="outline"
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={cn(
                'size-4',
                query.isFetching && 'animate-spin motion-reduce:animate-none',
              )}
            />
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <span className="sr-only">Đang tải dữ liệu dashboard…</span>
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              aria-hidden="true"
              className="h-44 animate-pulse rounded-2xl border bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : query.isError && !query.data ? (
        <Alert role="alert" title="Chưa thể tải thống kê" tone="error">
          Vui lòng thử lại bằng nút làm mới phía trên.
        </Alert>
      ) : (
        <>
          {query.isError ? (
            <Alert role="alert" tone="warning">
              Chưa thể làm mới. Các số liệu dưới đây là lần cập nhật thành công gần nhất.
            </Alert>
          ) : null}
          {!allTournaments.length ? (
            <div className={cn(panelClassName, 'flex flex-col items-center py-12 text-center')}>
              <span className="mb-4 grid size-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Trophy aria-hidden="true" className="size-8" />
              </span>
              <h3 className="text-xl font-bold">Sẵn sàng cho giải đấu đầu tiên</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Quản lý giải đấu, thêm vận động viên và phân công trọng tài. Thống kê sẽ xuất hiện
                khi có dữ liệu.
              </p>
              <Button asChild className="mt-5">
                <Link to="/admin/tournaments">
                  Quản lý giải đấu <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  tone="violet"
                  label="Tổng giải đấu"
                  value={summary.tournaments}
                  detail={`${String(summary.active)} giải đang hoạt động`}
                  icon={<Trophy />}
                />
                <StatCard
                  tone="sky"
                  index={1}
                  label="Tổng trận đấu"
                  value={summary.totalMatches}
                  detail={`${number.format(summary.matches.IN_PROGRESS)} đang diễn ra · ${number.format(summary.matches.NOT_STARTED)} chờ thi đấu`}
                  icon={<Swords />}
                />
                <StatCard
                  tone="emerald"
                  index={2}
                  label="Vận động viên"
                  value={summary.athletes}
                  detail={`${number.format(summary.organizations)} đơn vị · ${number.format(summary.weightClasses)} hạng cân`}
                  icon={<Users />}
                />
                <StatCard
                  tone="rose"
                  index={3}
                  label="Đội ngũ trọng tài"
                  value={summary.judges + summary.supervisors}
                  detail={`${number.format(summary.judges)} giám định · ${number.format(summary.supervisors)} giám sát`}
                  icon={<ShieldCheck />}
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
                <article className={panelClassName}>
                  <h3 className="font-bold">Trạng thái trận đấu</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Phân bổ theo tiến trình thi đấu
                  </p>
                  <div className="relative mx-auto my-5 size-44">
                    <svg
                      viewBox="0 0 160 160"
                      role="img"
                      aria-label={`Tổng ${String(summary.totalMatches)} trận, ${String(completed)}% hoàn thành`}
                      className="dashboard-donut size-full -rotate-90"
                    >
                      <circle
                        cx="80"
                        cy="80"
                        r="66"
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="15"
                      />
                      {matchSegments.map(({ key, color }) => {
                        const length = summary.totalMatches
                          ? (summary.matches[key] / summary.totalMatches) * 100
                          : 0;
                        const offset = donutOffset;
                        donutOffset += length;
                        return (
                          <circle
                            key={key}
                            cx="80"
                            cy="80"
                            r="66"
                            fill="none"
                            stroke={color}
                            strokeWidth="15"
                            pathLength="100"
                            strokeDasharray={`${String(length)} ${String(100 - length)}`}
                            strokeDashoffset={-offset}
                          />
                        );
                      })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-black tracking-tight tabular-nums">
                        {completed}%
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">Hoàn thành</span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
                    {matchSegments.map(({ key, label, className }) => (
                      <div key={key} className="flex items-center justify-between gap-2 text-xs">
                        <dt className="flex items-center gap-2 text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className={cn('size-2 shrink-0 rounded-full', className)}
                          />
                          {label}
                        </dt>
                        <dd className="text-sm font-bold tabular-nums">
                          {number.format(summary.matches[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>

                <article className={cn(panelClassName, 'flex flex-col')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">Nhịp độ các giải đấu</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Tối đa 5 giải có trận đấu · Ưu tiên giải đang hoạt động
                      </p>
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Activity aria-hidden="true" className="size-4" />
                    </span>
                  </div>
                  {chartTournaments.length ? (
                    <div className="my-6 flex flex-1 flex-col justify-center gap-5">
                      {chartTournaments.map((tournament) => (
                        <div key={tournament.id}>
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                            <Link
                              to={`/admin/tournaments/${tournament.id}/matches`}
                              className="truncate font-semibold hover:text-primary hover:underline"
                            >
                              {tournament.name}
                            </Link>
                            <span className="shrink-0 text-muted-foreground">
                              {number.format(totalMatches(tournament))} trận
                            </span>
                          </div>
                          <div
                            role="img"
                            aria-label={`${tournament.name}: ${matchSegments.map(({ key, label }) => `${String(tournament.matches[key])} ${label.toLowerCase()}`).join(', ')}`}
                            className="h-3 overflow-hidden rounded-full bg-slate-100"
                          >
                            <div
                              className="dashboard-bar flex h-full overflow-hidden rounded-full"
                              style={{
                                width: `${String((totalMatches(tournament) / maxMatches) * 100)}%`,
                              }}
                            >
                              {matchSegments.map(({ key, className, label }) => (
                                <span
                                  key={key}
                                  title={`${label}: ${String(tournament.matches[key])}`}
                                  className={cn('h-full', className)}
                                  style={{
                                    width: `${String((tournament.matches[key] / totalMatches(tournament)) * 100)}%`,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
                      Chưa có trận đấu trong phạm vi đã chọn.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-[11px] text-muted-foreground">
                    {matchSegments.map(({ key, label, className }) => (
                      <span key={key} className="flex items-center gap-1.5">
                        <span aria-hidden="true" className={cn('size-2 rounded-full', className)} />
                        {label}
                      </span>
                    ))}
                  </div>
                </article>
              </div>

              <DashboardPerformancePanel key={selectedScope} tournaments={tournaments} />

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                <article className={cn(panelClassName, '!p-0 overflow-hidden')}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
                    <div>
                      <h3 className="font-bold">Tiến độ giải đấu</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Theo dõi tiến trình và truy cập quản lý từng giải
                      </p>
                    </div>
                    <Badge tone="primary">{tournaments.length} giải đấu</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">
                        Thống kê trận đấu và vận động viên theo giải đấu
                      </caption>
                      <thead className="border-y bg-slate-50/80 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-5 py-3 font-medium sm:px-6">Giải đấu</th>
                          <th className="px-3 py-3 font-medium">Trạng thái</th>
                          <th className="px-3 py-3 text-right font-medium">VĐV</th>
                          <th className="min-w-32 px-5 py-3 font-medium sm:px-6">Hoàn thành</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sorted.slice(currentPage * 6, currentPage * 6 + 6).map((tournament) => {
                          const total = totalMatches(tournament);
                          const percent = completionPercent(tournament.matches.COMPLETED, total);
                          return (
                            <tr
                              key={tournament.id}
                              className="transition-colors hover:bg-slate-50/70"
                            >
                              <th scope="row" className="max-w-64 px-5 py-4 font-normal sm:px-6">
                                <Link
                                  className="line-clamp-2 font-semibold hover:text-primary hover:underline"
                                  to={`/admin/tournaments/${tournament.id}`}
                                >
                                  {tournament.name}
                                </Link>
                                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                  {tournament.sport.name} ·{' '}
                                  {tournament.startDate
                                    ? formatDate(tournament.startDate)
                                    : 'Chưa có ngày bắt đầu'}
                                </span>
                                {tournament.matches.IN_PROGRESS > 0 ? (
                                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                    <Activity aria-hidden="true" className="size-3" />
                                    {tournament.matches.IN_PROGRESS} trận đang diễn ra
                                  </span>
                                ) : null}
                              </th>
                              <td className="px-3 py-4">
                                <TournamentStatusBadge status={tournament.status} />
                              </td>
                              <td className="px-3 py-4 text-right font-semibold tabular-nums">
                                {number.format(tournament.athleteCount)}
                              </td>
                              <td className="px-5 py-4 sm:px-6">
                                <div className="mb-2 flex justify-between gap-3 text-xs">
                                  <span className="font-semibold tabular-nums">
                                    {tournament.matches.COMPLETED}/{total}
                                  </span>
                                  <span className="text-muted-foreground">{percent}%</span>
                                </div>
                                <div
                                  role="progressbar"
                                  aria-label={`Tiến độ ${tournament.name}`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={percent}
                                  className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                                >
                                  <div
                                    className="dashboard-bar h-full rounded-full bg-indigo-500"
                                    style={{ width: `${String(percent)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground sm:px-6">
                    <span>
                      Trang {currentPage + 1}/{pageCount} · {tournaments.length} giải đấu
                    </span>
                    <div className="flex gap-1">
                      <Button
                        aria-label="Trang trước"
                        title="Trang trước"
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        disabled={currentPage === 0}
                        onClick={() => {
                          setPage(currentPage - 1);
                        }}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button
                        aria-label="Trang sau"
                        title="Trang sau"
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        disabled={currentPage + 1 >= pageCount}
                        onClick={() => {
                          setPage(currentPage + 1);
                        }}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </article>

                <aside className="space-y-5">
                  <article className={panelClassName}>
                    <h3 className="font-bold">Lực lượng điều hành</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nhân sự đang được kích hoạt
                    </p>
                    <dl className="mt-5 space-y-5">
                      {[
                        {
                          label: 'Giám định',
                          count: summary.judges,
                          Icon: ClipboardCheck,
                          color: 'bg-indigo-500',
                          iconColor: 'bg-indigo-50 text-indigo-600',
                        },
                        {
                          label: 'Giám sát',
                          count: summary.supervisors,
                          Icon: ShieldCheck,
                          color: 'bg-sky-400',
                          iconColor: 'bg-sky-50 text-sky-600',
                        },
                      ].map(({ label, count, Icon, color, iconColor }) => (
                        <div key={label}>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn('grid size-9 place-items-center rounded-lg', iconColor)}
                            >
                              <Icon aria-hidden="true" className="size-4" />
                            </span>
                            <dt className="flex-1 text-sm font-medium">{label}</dt>
                            <dd className="text-xl font-bold tabular-nums">
                              {number.format(count)}
                            </dd>
                          </div>
                          <div
                            aria-hidden="true"
                            className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                          >
                            <div
                              className={cn('h-full rounded-full', color)}
                              style={{
                                width: `${String((count / Math.max(summary.judges + summary.supervisors, 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-5 border-t pt-4 text-[11px] leading-5 text-muted-foreground">
                      Tính theo đăng ký ở mỗi giải. Một người tham gia nhiều giải được tính tại từng
                      giải.
                    </p>
                  </article>
                  <article className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
                    <CalendarDays aria-hidden="true" className="mb-3 size-5 text-sky-600" />
                    <h3 className="text-sm font-bold">Chuẩn bị thi đấu</h3>
                    <p className="mt-2 text-2xl font-black tabular-nums text-sky-900">
                      {number.format(summary.matches.NOT_STARTED)}{' '}
                      <span className="text-sm font-medium">trận đang chờ</span>
                    </p>
                    <p className="mt-2 text-xs leading-5 text-sky-800/80">
                      Các trận đã tạo và chưa bắt đầu. Kiểm tra vận động viên và phân công trọng tài
                      trước khi thi đấu.
                    </p>
                    <Link
                      to={
                        selectedScope === 'all'
                          ? '/admin/tournaments'
                          : `/admin/tournaments/${selectedScope}/matches`
                      }
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-800 hover:underline"
                    >
                      Đi đến giải đấu <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </article>
                </aside>
              </div>
              <p className="flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
                <Building2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                Vận động viên, đơn vị và hạng cân chỉ tính các đăng ký đang hoạt động. Phạm vi “Tất
                cả giải đấu” bao gồm cả giải đã lưu trữ.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
