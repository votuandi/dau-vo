import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, Search } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { officialAccessApi, type OfficialMatch } from '@/services/api/official-access';
import {
  presentLifecycle,
  presentPhase,
  type MatchSemanticVariant,
} from '@/features/match-presentation';
import { MatchLifecycle } from '@/types/shared';
import { selectClassName } from '@/features/admin-management/presentation';
import { cn } from '@/lib/utils';

const badgeStyles: Record<MatchSemanticVariant, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-50 text-sky-700',
  warning: 'bg-amber-50 text-amber-800',
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-red-50 text-red-700',
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase()
    .trim();
}

function MatchCard({
  match,
  current,
}: {
  readonly match: OfficialMatch;
  readonly current: boolean;
}) {
  const presentation =
    match.lifecycle === MatchLifecycle.IN_PROGRESS
      ? presentPhase(match.status)
      : presentLifecycle(match.lifecycle);
  return (
    <article
      aria-label={`Trận ${match.publicId}`}
      aria-current={current ? 'true' : undefined}
      className={`border-l-2 px-3 py-2.5 ${current ? 'border-l-sky-600 bg-sky-50' : 'border-l-transparent bg-white'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="font-mono text-xs font-bold text-slate-900">{match.publicId}</h3>
          <p className="text-xs text-slate-500">
            {match.weightClass?.name ?? 'Chưa phân hạng cân'}
            {match.roundNumber != null ? ` · Vòng ${String(match.roundNumber)}` : ''}
            {match.position != null ? ` · Trận ${String(match.position)}` : ''}
          </p>
        </div>
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${badgeStyles[presentation.variant]}`}
        >
          {presentation.label}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
        {(['RED', 'BLUE'] as const).map((color) => (
          <p
            key={color}
            className={`min-w-0 break-words text-sm font-semibold leading-snug ${color === 'RED' ? 'text-red-700' : 'text-blue-700'}`}
          >
            <span className="sr-only">VĐV {color === 'RED' ? 'đỏ' : 'xanh'}: </span>
            {match.athletes.find((athlete) => athlete.color === color)?.name ?? 'Chưa xác định'}
          </p>
        ))}
      </div>
      {current ? (
        <p className="mt-1 text-[11px] font-semibold text-sky-700">Đang điều khiển</p>
      ) : null}
    </article>
  );
}

export function SupervisorMatchListDialog({
  currentId,
  onClose,
}: {
  readonly currentId?: string | undefined;
  readonly onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [weightClassId, setWeightClassId] = useState('');
  const matches = useQuery({
    queryKey: ['supervisor-match-list'],
    queryFn: officialAccessApi.matches,
  });
  const allMatches = matches.data?.matches ?? [];
  const weightClasses = [
    ...new Map(
      allMatches.flatMap((match) =>
        match.weightClass ? [[match.weightClass.id, match.weightClass] as const] : [],
      ),
    ).values(),
  ];
  const query = normalize(search);
  const filtered = allMatches
    .filter(
      (match) =>
        (!weightClassId || match.weightClass?.id === weightClassId) &&
        normalize(
          [
            match.publicId,
            match.weightClass?.name,
            ...match.athletes.map((athlete) => athlete.name),
          ].join(' '),
        ).includes(query),
    )
    .sort((a, b) => Number(b.publicId === currentId) - Number(a.publicId === currentId));
  return (
    <Dialog
      title="Danh sách trận"
      description="Theo dõi các trận đấu và trạng thái thi đấu trong giải."
      onClose={onClose}
      showCloseButton
      className="max-w-3xl p-4 sm:p-5 [&>p]:sr-only"
    >
      <div className="mt-3 space-y-1">
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400"
            />
            <input
              aria-label="Tìm trận đấu"
              placeholder="Tìm mã trận, tên VĐV…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </div>
          <div>
            <select
              aria-label="Lọc hạng cân"
              value={weightClassId}
              onChange={(event) => {
                setWeightClassId(event.target.value);
              }}
              className={cn(selectClassName, 'mt-0 h-9 text-xs')}
            >
              <option value="">Tất cả hạng cân</option>
              {weightClasses.map((weight) => (
                <option key={weight.id} value={weight.id}>
                  {weight.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p aria-live="polite" className="text-xs font-medium text-slate-500">
            {matches.data
              ? `${String(filtered.length)} / ${String(allMatches.length)} trận đấu`
              : 'Danh sách trận đấu'}
          </p>
          <Button
            type="button"
            variant="ghost"
            className="min-h-7 gap-1.5 px-1 py-1 text-xs"
            disabled={matches.isFetching}
            onClick={() => void matches.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-3.5 ${matches.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
            {matches.isFetching ? 'Đang cập nhật…' : 'Cập nhật'}
          </Button>
        </div>
      </div>
      <div className="mt-1 max-h-[65dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-lg border border-slate-200">
        {matches.isPending ? (
          <div role="status" className="space-y-1 p-2">
            <span className="sr-only">Đang tải danh sách trận…</span>
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded bg-slate-100 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null}
        {matches.isError ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
            <div>
              <p className="font-bold">Không thể tải danh sách trận.</p>
              <p className="mt-1">Vui lòng thử cập nhật lại danh sách.</p>
            </div>
          </div>
        ) : null}
        {matches.data && filtered.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-sm font-bold text-slate-700">
              {allMatches.length === 0 ? 'Chưa có trận đấu.' : 'Không tìm thấy trận phù hợp.'}
            </p>
            {allMatches.length > 0 ? (
              <Button
                type="button"
                variant="link"
                className="mt-1"
                onClick={() => {
                  setSearch('');
                  setWeightClassId('');
                }}
              >
                Xóa bộ lọc
              </Button>
            ) : null}
          </div>
        ) : null}
        {filtered.map((match) => (
          <MatchCard key={match.id} match={match} current={match.publicId === currentId} />
        ))}
      </div>
    </Dialog>
  );
}
