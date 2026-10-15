import { Link } from 'react-router-dom';

const tabs = [
  ['info', 'Thông tin'],
  ['weight-classes', 'Hạng cân'],
  ['organizations', 'Đơn vị tham gia'],
  ['athletes', 'Vận động viên'],
  ['matches', 'Trận đấu'],
  ['judges', 'Giám định'],
  ['supervisors', 'Giám sát'],
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
    <nav aria-label="Khu vực quản lý giải đấu" className="overflow-x-auto border-b">
      <div className="flex min-w-max gap-1">
        {tabs.map(([id, label]) => (
          <Link
            aria-current={id === active ? 'page' : undefined}
            className={
              id === active
                ? 'whitespace-nowrap border-b-2 border-primary px-3 py-3 text-sm font-bold'
                : 'whitespace-nowrap px-3 py-3 text-sm text-muted-foreground hover:text-foreground'
            }
            key={id}
            to={
              id === 'info'
                ? `/admin/tournaments/${tournamentId}`
                : `/admin/tournaments/${tournamentId}/${id}`
            }
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
