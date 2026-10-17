import { Building2, ClipboardCheck, Info, Scale, ShieldCheck, Swords, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TabScroller } from '@/components/ui/tabs';
import { tabListClassName, tabTriggerClassName } from '@/components/ui/tab-styles';

const tabs = [
  ['info', 'Thông tin', Info],
  ['weight-classes', 'Hạng cân', Scale],
  ['organizations', 'Đơn vị tham gia', Building2],
  ['athletes', 'Vận động viên', Users],
  ['matches', 'Trận đấu', Swords],
  ['judges', 'Giám định', ClipboardCheck],
  ['supervisors', 'Giám sát', ShieldCheck],
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
    <nav aria-label="Khu vực quản lý giải đấu">
      <TabScroller>
        <div className={tabListClassName}>
          {tabs.map(([id, label, Icon]) => (
            <Link
              aria-current={id === active ? 'page' : undefined}
              className={tabTriggerClassName(id === active)}
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
