import {
  Building2,
  ClipboardCheck,
  Handshake,
  Info,
  Scale,
  ShieldCheck,
  Swords,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { TabScroller } from '@/components/ui/tabs';
import { tabListClassName, tabTriggerClassName } from '@/components/ui/tab-styles';
import { cn } from '@/lib/utils';

const tabs = [
  ['info', 'Thông tin', Info],
  ['weight-classes', 'Hạng cân', Scale],
  ['organizations', 'Đơn vị tham gia', Building2],
  ['athletes', 'Vận động viên', Users],
  ['matches', 'Trận đấu', Swords],
  ['judges', 'Giám định', ClipboardCheck],
  ['supervisors', 'Giám sát', ShieldCheck],
  ['sponsors', 'Nhà tài trợ', Handshake],
] as const;
export type TournamentTab = (typeof tabs)[number][0];

export function TournamentTabs({
  tournamentId,
  active,
}: {
  readonly tournamentId: string;
  readonly active: TournamentTab;
}) {
  return (
    // A left menu from `lg` up; below that it falls back to the scrollable tab strip.
    <nav aria-label="Khu vực quản lý giải đấu" className="min-w-0 lg:sticky lg:top-24">
      <TabScroller className="lg:m-0 lg:overflow-visible lg:p-0">
        <div className={cn(tabListClassName, 'lg:w-full lg:min-w-0 lg:flex-col')}>
          {tabs.map(([id, label, Icon]) => (
            <Link
              aria-current={id === active ? 'page' : undefined}
              className={cn(tabTriggerClassName(id === active), 'lg:w-full')}
              key={id}
              to={
                id === 'info'
                  ? `/admin/tournaments/${tournamentId}`
                  : `/admin/tournaments/${tournamentId}/${id}`
              }
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </TabScroller>
    </nav>
  );
}
