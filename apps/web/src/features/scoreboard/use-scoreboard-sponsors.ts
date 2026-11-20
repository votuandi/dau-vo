import { useQuery } from '@tanstack/react-query';
import { publicSponsorsApi, type PublicSponsor } from '@/services/api/watch';
import type { ScoreboardSource } from './scoreboard-source';

const REFRESH_MS = 5 * 60_000;
const NO_SPONSORS: readonly PublicSponsor[] = [];

/**
 * Sponsors of the tournament on screen: found from the match when there is one,
 * otherwise from the supervisor's tournament code (waiting screen).
 */
export function useScoreboardSponsors(
  source: ScoreboardSource,
  matchPublicId?: string,
): readonly PublicSponsor[] {
  const key = matchPublicId
    ? ({ kind: 'match', id: matchPublicId } as const)
    : source.kind === 'supervisor'
      ? ({ kind: 'tournament', id: source.tournamentCode } as const)
      : null;
  const query = useQuery({
    queryKey: ['public', 'sponsors', key?.kind, key?.id],
    queryFn: () =>
      key?.kind === 'match'
        ? publicSponsorsApi.byMatch(key.id)
        : publicSponsorsApi.byTournament(key?.id ?? ''),
    enabled: key !== null,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    // Sponsors are decoration: never let a failure disturb the scoreboard.
    retry: 1,
  });
  return query.data?.sponsors ?? NO_SPONSORS;
}
