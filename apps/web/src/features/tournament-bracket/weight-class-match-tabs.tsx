import { useEffect, useRef } from 'react';
import { TabCount, TabScroller } from '@/components/ui/tabs';
import { tabListClassName, tabTriggerClassName } from '@/components/ui/tab-styles';
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
    <TabScroller>
      <div aria-label="Hạng cân" className={tabListClassName} role="tablist">
        {items.map((item, index) => (
          <button
            aria-controls="weight-class-match-panel"
            aria-selected={selectedId === item.id}
            className={tabTriggerClassName(selectedId === item.id)}
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
            <TabCount
              active={selectedId === item.id}
              label={`${String(counts.get(item.id ?? '__unassigned') ?? 0)} trận`}
            >
              {counts.get(item.id ?? '__unassigned') ?? 0}
            </TabCount>
          </button>
        ))}
      </div>
    </TabScroller>
  );
}
