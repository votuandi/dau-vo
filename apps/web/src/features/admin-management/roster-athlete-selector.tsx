import { useMemo, useState } from 'react';
import { inputClassName } from './presentation';
import type { TournamentAthlete } from '@/services/api/admin-management';
import { AthleteColor } from '@/types/shared';

export function RosterAthleteSelector({
  athletes,
  color,
  disabled = false,
  excludedAthleteId,
  label,
  loading = false,
  onChange,
  selectedAthleteId,
  weightClassName,
}: {
  readonly athletes: readonly TournamentAthlete[];
  readonly color: AthleteColor;
  readonly disabled?: boolean;
  readonly excludedAthleteId?: string | null;
  readonly label: string;
  readonly loading?: boolean;
  readonly onChange: (athleteId: string) => void;
  readonly selectedAthleteId: string | null;
  readonly weightClassName: string | undefined;
}) {
  const [search, setSearch] = useState('');
  const available = useMemo(
    () => athletes.filter((athlete) => athlete.id !== excludedAthleteId),
    [athletes, excludedAthleteId],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('vi');
    if (!needle) return available;
    return available.filter((athlete) =>
      [athlete.name, athlete.unit?.name ?? '', athlete.birthYear, athlete.weightClass.name]
        .join(' ')
        .toLocaleLowerCase('vi')
        .includes(needle),
    );
  }, [available, search]);
  const selected = athletes.find((athlete) => athlete.id === selectedAthleteId);
  const colorClasses: Record<AthleteColor, string> = {
    [AthleteColor.RED]: 'border-red-200 bg-red-50/60',
    [AthleteColor.BLUE]: 'border-blue-200 bg-blue-50/60',
  };

  return (
    <div className={`rounded-xl border-2 p-4 ${colorClasses[color]}`}>
      <p className="font-black">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {weightClassName
          ? `Chỉ vận động viên đang hoạt động · ${weightClassName}`
          : 'Chọn hạng cân trước.'}
      </p>
      <label className="mt-3 block text-sm font-semibold" htmlFor={`${color}-athlete-search`}>
        Tìm vận động viên
      </label>
      <input
        className={inputClassName}
        disabled={disabled || !weightClassName}
        id={`${color}-athlete-search`}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        placeholder="Tên, đơn vị hoặc năm sinh"
        type="search"
        value={search}
      />
      <label className="mt-3 block text-sm font-semibold" htmlFor={`${color}-athlete-select`}>
        {label}
      </label>
      <select
        aria-describedby={`${color}-athlete-help`}
        className={inputClassName}
        disabled={disabled || !weightClassName || loading || available.length === 0}
        id={`${color}-athlete-select`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={selectedAthleteId ?? ''}
      >
        <option value="">{loading ? 'Đang tải danh sách…' : 'Chọn vận động viên'}</option>
        {visible.map((athlete) => (
          <option key={athlete.id} value={athlete.id}>
            {athlete.name} · {athlete.birthYear} · {athlete.unit?.name ?? 'Không đơn vị'}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-muted-foreground" id={`${color}-athlete-help`}>
        {loading
          ? 'Đang tải danh sách đăng ký.'
          : visible.length === 0 && available.length > 0
            ? 'Không có kết quả phù hợp.'
            : excludedAthleteId
              ? 'Vận động viên đã chọn ở góc còn lại được loại khỏi danh sách.'
              : `${String(available.length)} vận động viên đủ điều kiện.`}
      </p>
      {selected ? <AthleteCard athlete={selected} /> : null}
    </div>
  );
}

export function AthleteCard({ athlete }: { readonly athlete: TournamentAthlete }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      {athlete.imageUrl ? (
        <img
          alt={`Ảnh ${athlete.name}`}
          className="size-12 rounded-full object-cover"
          src={athlete.imageUrl}
        />
      ) : (
        <div
          aria-label={`Chưa có ảnh ${athlete.name}`}
          className="grid size-12 place-items-center rounded-full bg-muted font-black"
          role="img"
        >
          VĐV
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-bold">{athlete.name}</p>
        <p className="text-xs text-muted-foreground">
          {athlete.birthYear} · {athlete.unit?.name ?? 'Không đơn vị'} · {athlete.weightClass.name}
        </p>
      </div>
    </div>
  );
}
