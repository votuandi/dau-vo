import { Link } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/features/admin-management/presentation';
import type { adminManagementApi } from '@/services/api/admin-management';

type MatchListResult = Awaited<ReturnType<typeof adminManagementApi.listMatches>>;

/** Matches created outside a bracket for the selected weight class. */
export function StandaloneMatchList({
  matches,
}: {
  readonly matches: UseQueryResult<MatchListResult>;
}) {
  if (matches.isPending)
    return (
      <div className="space-y-3">
        <h3 className="font-black">Trận riêng lẻ</h3>
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  if (matches.isError)
    return (
      <div role="alert">
        <h3 className="font-black">Trận riêng lẻ</h3>
        <p className="mt-2 text-sm text-destructive">
          {getApiErrorMessage(matches.error, 'Không thể tải danh sách trận.')}
        </p>
        <Button
          className="mt-3"
          onClick={() => void matches.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Thử lại
        </Button>
      </div>
    );
  const standalone = matches.data.matches.filter((match) => !match.bracketFixtureId);
  return (
    <div className="min-w-0">
      <h3 className="font-black">Trận riêng lẻ</h3>
      {standalone.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Chưa có trận riêng lẻ trong hạng cân này.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {standalone.map((match) => (
            <li className="break-words rounded-lg border p-3" key={match.id}>
              <Link className="font-bold underline" to={`/admin/matches/${match.id}`}>
                {match.publicId}
              </Link>{' '}
              · {match.athletes.map((athlete) => athlete.name).join(' — ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
