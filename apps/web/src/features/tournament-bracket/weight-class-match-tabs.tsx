import { useEffect, useRef } from 'react';
import type { TournamentRosterItem } from '@/services/api/admin-management';

interface Props {
  readonly classes: readonly TournamentRosterItem[];
  readonly counts: ReadonlyMap<string, number>;
  readonly selectedId: string | null;
  readonly unassignedCount: number;
  readonly onSelect: (id: string | null) => void;
}

export function WeightClassMatchTabs({
  classes,
  counts,
  selectedId,
  unassignedCount,
  onSelect,
}: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const items = [
    ...classes.map((item) => ({ id: item.id, label: item.name })),
    ...(unassignedCount ? [{ id: null, label: 'Chưa xác định' }] : []),
  ];
  useEffect(() => {
    refs.current = refs.current.slice(0, items.length);
  }, [items.length]);
  return (
    <div aria-label="Hạng cân" className="overflow-x-auto border-b" role="tablist">
      <div className="flex min-w-max gap-1">
        {items.map((item, index) => (
          <button
            aria-controls="weight-class-match-panel"
            aria-selected={selectedId === item.id}
            className={
              selectedId === item.id
                ? 'border-b-2 border-primary px-3 py-3 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary'
                : 'px-3 py-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary'
            }
            key={item.id ?? '__unassigned'}
            onClick={() => {
              onSelect(item.id);
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
              onSelect(items[next]?.id ?? null);
              refs.current[next]?.focus();
            }}
            ref={(element) => {
              refs.current[index] = element;
            }}
            role="tab"
            tabIndex={selectedId === item.id ? 0 : -1}
            type="button"
          >
            {item.label}{' '}
            <span
              aria-label={`${String(counts.get(item.id ?? '__unassigned') ?? 0)} trận`}
              className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs"
            >
              {counts.get(item.id ?? '__unassigned') ?? 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
