import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { inputClassName } from './presentation';
import type { TournamentAthlete } from '@/services/api/admin-management';
import { cn } from '@/lib/utils';
import { AthleteColor } from '@/types/shared';

const colorClasses: Record<AthleteColor, string> = {
  [AthleteColor.RED]: 'border-red-200 bg-red-50/60',
  [AthleteColor.BLUE]: 'border-blue-200 bg-blue-50/60',
};

function athleteOptionLabel(athlete: TournamentAthlete): string {
  return `${athlete.name} · ${String(athlete.birthYear)} · ${athlete.organization?.name ?? 'Không đơn vị'}`;
}

function matchesSearch(athlete: TournamentAthlete, needle: string): boolean {
  return [
    athlete.name,
    athlete.organization?.name ?? '',
    athlete.birthYear,
    athlete.weightClass.name,
  ]
    .join(' ')
    .toLocaleLowerCase('vi')
    .includes(needle);
}

/**
 * Searchable athlete picker (WAI-ARIA combobox with a listbox popup): typing filters the
 * eligible athletes by name, organization, birth year or weight class.
 */
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
  /** Receives the chosen athlete id, or `''` when the selection is cleared. */
  readonly onChange: (athleteId: string) => void;
  readonly selectedAthleteId: string | null;
  readonly weightClassName: string | undefined;
}) {
  const baseId = useId();
  const inputId = `${color}-athlete-select`;
  const listboxId = `${baseId}-listbox`;
  const helpId = `${color}-athlete-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // `null` while the user is not typing: the input then shows the selected athlete.
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const available = useMemo(
    () => athletes.filter((athlete) => athlete.id !== excludedAthleteId),
    [athletes, excludedAthleteId],
  );
  const visible = useMemo(() => {
    const needle = (query ?? '').trim().toLocaleLowerCase('vi');
    return needle ? available.filter((athlete) => matchesSearch(athlete, needle)) : available;
  }, [available, query]);
  const selected = athletes.find((athlete) => athlete.id === selectedAthleteId);
  const inputDisabled = disabled || !weightClassName || loading || available.length === 0;
  const expanded = open && !inputDisabled;
  const activeOption = expanded ? visible[Math.min(activeIndex, visible.length - 1)] : undefined;

  function openList(): void {
    const selectedIndex = visible.findIndex((athlete) => athlete.id === selectedAthleteId);
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  }
  function close(): void {
    setOpen(false);
    setQuery(null);
  }
  function choose(athlete: TournamentAthlete): void {
    onChange(athlete.id);
    close();
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!expanded) {
          openList();
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((index) => (index + step + visible.length) % Math.max(visible.length, 1));
        return;
      }
      case 'Enter':
        if (expanded && activeOption) {
          event.preventDefault();
          choose(activeOption);
        }
        return;
      case 'Escape':
        if (expanded) {
          event.preventDefault();
          close();
        }
        return;
      default:
    }
  }

  return (
    <div className={`rounded-xl border-2 p-4 ${colorClasses[color]}`}>
      <p className="font-black">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {weightClassName
          ? `Chỉ vận động viên đang hoạt động · ${weightClassName}`
          : 'Chọn hạng cân trước.'}
      </p>
      <label className="mt-3 block text-sm font-semibold" htmlFor={inputId}>
        {label}
      </label>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) close();
        }}
      >
        <input
          aria-activedescendant={activeOption ? `${baseId}-${activeOption.id}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={helpId}
          aria-expanded={expanded}
          autoComplete="off"
          className={cn(inputClassName, 'pr-16')}
          disabled={inputDisabled}
          id={inputId}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onClick={() => {
            if (!expanded) openList();
          }}
          onKeyDown={handleKeyDown}
          placeholder={loading ? 'Đang tải danh sách…' : 'Chọn hoặc tìm VĐV'}
          ref={inputRef}
          role="combobox"
          type="text"
          value={query ?? (selected ? athleteOptionLabel(selected) : '')}
        />
        <div className="absolute inset-y-0 right-2 mt-1.5 flex items-center gap-0.5">
          {selected && !inputDisabled ? (
            <button
              aria-label={`Bỏ chọn ${selected.name}`}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                onChange('');
                setQuery(null);
                inputRef.current?.focus();
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <button
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-md text-muted-foreground disabled:opacity-50"
            disabled={inputDisabled}
            onClick={() => {
              if (expanded) close();
              else openList();
              inputRef.current?.focus();
            }}
            tabIndex={-1}
            type="button"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            />
          </button>
        </div>
        {expanded ? (
          <ul
            aria-label={label}
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-card p-1 text-sm shadow-lg"
            id={listboxId}
            role="listbox"
          >
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground" role="presentation">
                Không có kết quả phù hợp.
              </li>
            ) : (
              visible.map((athlete) => {
                const isSelected = athlete.id === selectedAthleteId;
                const isActive = athlete.id === activeOption?.id;
                return (
                  <li
                    aria-selected={isSelected}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2',
                      isActive && 'bg-accent text-primary',
                      isSelected && 'font-semibold',
                    )}
                    id={`${baseId}-${athlete.id}`}
                    key={athlete.id}
                    onClick={() => {
                      choose(athlete);
                    }}
                    onMouseDown={(event) => {
                      // Keep focus in the input so the blur handler does not close first.
                      event.preventDefault();
                    }}
                    onMouseEnter={() => {
                      setActiveIndex(visible.indexOf(athlete));
                    }}
                    role="option"
                  >
                    <span className="min-w-0 flex-1 truncate">{athleteOptionLabel(athlete)}</span>
                    {isSelected ? (
                      <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground" id={helpId}>
        {loading
          ? 'Đang tải danh sách đăng ký.'
          : expanded && visible.length === 0
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
          className="size-12 shrink-0 rounded-full object-cover"
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
          {athlete.birthYear} · {athlete.organization?.name ?? 'Không đơn vị'} ·{' '}
          {athlete.weightClass.name}
        </p>
      </div>
    </div>
  );
}
