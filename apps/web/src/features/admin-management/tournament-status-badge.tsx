import { Badge, type BadgeTone } from '@/components/ui/badge';
import { TournamentStatus } from '@/types/shared';
import { tournamentStatusLabels } from './presentation';

const tournamentStatusTones: Record<TournamentStatus, BadgeTone> = {
  [TournamentStatus.DRAFT]: 'neutral',
  [TournamentStatus.ACTIVE]: 'success',
  [TournamentStatus.FINISHED]: 'primary',
  [TournamentStatus.ARCHIVED]: 'warning',
};

export function TournamentStatusBadge({ status }: { readonly status: TournamentStatus }) {
  return (
    <Badge dot tone={tournamentStatusTones[status]}>
      {tournamentStatusLabels[status]}
    </Badge>
  );
}
