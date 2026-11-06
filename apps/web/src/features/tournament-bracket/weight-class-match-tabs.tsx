import { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';
import { TabCount, TabScroller } from '@/components/ui/tabs';
import { chipListClassName, chipTriggerClassName, type ChipTone } from '@/components/ui/tab-styles';
import { cn } from '@/lib/utils';
import type {
  TournamentRosterItem,
  WeightClassBracketProgress,
} from '@/services/api/admin-management';

const PROGRESS_META: Record<
  WeightClassBracketProgress,
  { readonly label: string; readonly dotClassName: string }
> = {
  NONE: {
    label: 'Chưa bốc thăm',
    dotClassName: 'border border-slate-400 bg-white',
  },
  DRAWN: { label: 'Đã bốc thăm', dotClassName: 'bg-violet-500' },
  IN_PROGRESS: { label: 'Đang thi đấu', dotClassName: 'bg-amber-500 animate-pulse' },
  COMPLETED: { label: 'Hoàn tất', dotClassName: 'bg-emerald-500' },
};

// All weight class chips share one blue; the selected chip is a deeper, filled blue.
const WEIGHT_CLASS_TONE: ChipTone = {
  idle: 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100',
  active: 'border-blue-700 bg-blue-700 text-white shadow-md shadow-blue-700/25',
};

/** Status dot shown on a weight class chip and in the legend. */
function ProgressDot({ progress }: { readonly progress: WeightClassBracketProgress }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full ring-1 ring-white',
        PROGRESS_META[progress].dotClassName,
      )}
    />
  );
}

interface Props {
  readonly classes: readonly (TournamentRosterItem & {
    readonly bracketProgress?: WeightClassBracketProgress;
  })[];
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
    ...classes.map((item) => ({
      id: item.id,
      label: item.name,
      progress: item.bracketProgress,
    })),
    ...(unassignedCount ? [{ id: null, label: 'Chưa xác định', progress: undefined }] : []),
  ];
  useEffect(() => {
    refs.current = refs.current.slice(0, items.length);
  }, [items.length]);
  return (
    <div className="flex items-center gap-3">
      <TabScroller className="min-w-0 flex-1">
        <div aria-label="Hạng cân" className={chipListClassName} role="tablist">
          {items.map((item, index) => (
            <button
              aria-controls="weight-class-match-panel"
              aria-selected={selectedId === item.id}
              className={chipTriggerClassName(selectedId === item.id, WEIGHT_CLASS_TONE)}
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
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) %
                        items.length;
                onSelect(items[next]?.id ?? null);
                refs.current[next]?.focus();
              }}
              ref={(element) => {
                refs.current[index] = element;
              }}
              role="tab"
              tabIndex={selectedId === item.id ? 0 : -1}
              title={item.progress ? PROGRESS_META[item.progress].label : undefined}
              type="button"
            >
              {item.progress ? (
                <>
                  <ProgressDot progress={item.progress} />
                  <span className="sr-only">{PROGRESS_META[item.progress].label}: </span>
                </>
              ) : null}
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
      {classes.some((item) => item.bracketProgress) ? (
        <details className="relative shrink-0">
          <summary
            aria-label="Chú thích trạng thái hạng cân"
            className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
            title="Chú thích trạng thái"
          >
            <Info aria-hidden="true" className="size-4" />
          </summary>
          <ul className="absolute right-0 z-20 mt-2 w-44 space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs shadow-lg">
            {(Object.keys(PROGRESS_META) as WeightClassBracketProgress[]).map((progress) => (
              <li className="flex items-center gap-2" key={progress}>
                <ProgressDot progress={progress} />
                {PROGRESS_META[progress].label}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
