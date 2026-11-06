import { useRef, type ReactNode } from 'react';
import { CalendarDays, GitFork, ListChecks, Settings2 } from 'lucide-react';
import { TabCount } from '@/components/ui/tabs';
import { underlineListClassName, underlineTriggerClassName } from '@/components/ui/tab-styles';
import { MATCH_SECTIONS, type MatchSection } from './match-section';

const SECTION_META: Record<MatchSection, { readonly label: string; readonly icon: ReactNode }> = {
  bracket: { label: 'Sơ đồ nhánh đấu', icon: <GitFork aria-hidden="true" /> },
  schedule: { label: 'Danh sách trận đấu', icon: <CalendarDays aria-hidden="true" /> },
  settings: { label: 'Cấu hình', icon: <Settings2 aria-hidden="true" /> },
  standalone: { label: 'Trận riêng lẻ', icon: <ListChecks aria-hidden="true" /> },
};

const matchSectionTabId = (section: MatchSection) => `match-section-tab-${section}`;
const matchSectionPanelId = (section: MatchSection) => `match-section-panel-${section}`;

/** Secondary tab strip that splits one weight class into bracket, schedule, standalone and settings views. */
export function MatchSectionTabs({
  selected,
  counts,
  onSelect,
}: {
  readonly selected: MatchSection;
  readonly counts: Partial<Record<MatchSection, number>>;
  readonly onSelect: (section: MatchSection) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="overflow-x-auto">
      <div aria-label="Nội dung hạng cân" className={underlineListClassName} role="tablist">
        {MATCH_SECTIONS.map((section, index) => {
          const active = section === selected;
          const count = counts[section];
          return (
            <button
              aria-controls={matchSectionPanelId(section)}
              aria-selected={active}
              className={underlineTriggerClassName(active)}
              id={matchSectionTabId(section)}
              key={section}
              onClick={() => {
                onSelect(section);
              }}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const last = MATCH_SECTIONS.length - 1;
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + MATCH_SECTIONS.length) %
                        MATCH_SECTIONS.length;
                const target = MATCH_SECTIONS[next];
                if (target) onSelect(target);
                refs.current[next]?.focus();
              }}
              ref={(element) => {
                refs.current[index] = element;
              }}
              role="tab"
              tabIndex={active ? 0 : -1}
              type="button"
            >
              {SECTION_META[section].icon}
              {SECTION_META[section].label}
              {count === undefined ? null : (
                <TabCount active={active} variant="subtle" label={`${String(count)} mục`}>
                  {count}
                </TabCount>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MatchSectionPanel({
  section,
  selected,
  children,
}: {
  readonly section: MatchSection;
  readonly selected: MatchSection;
  readonly children: ReactNode;
}) {
  return (
    <div
      aria-labelledby={matchSectionTabId(section)}
      className="min-w-0"
      hidden={section !== selected}
      id={matchSectionPanelId(section)}
      role="tabpanel"
    >
      {children}
    </div>
  );
}
