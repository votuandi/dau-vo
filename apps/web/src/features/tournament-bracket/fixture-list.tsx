import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Crown, Eye } from 'lucide-react';
import { bracketRoundLabel as roundLabel } from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import {
  matchVariantClassName,
  presentDisplayState,
  presentLifecycle,
  presentPhase,
} from '@/features/match-presentation';
import type { ActiveBracket } from '@/services/api/admin-management';
import { MatchDisplayState, MatchLifecycle } from '@/types/shared';
import {
  canDecideManually,
  fixtureSideLabel,
  fixtureSurfaceClassName,
  groupFixturesByRound,
  manualWinnerDecisionType,
  type BracketFixture,
} from './fixture-presentation';

export function FixtureList({
  data,
  disabled,
  onPrepare,
  onDecide,
}: {
  readonly data: ActiveBracket;
  readonly disabled: boolean;
  readonly onPrepare: (id: string) => void;
  readonly onDecide: (fixture: BracketFixture) => void;
}) {
  const groups = useMemo(() => groupFixturesByRound(data.fixtures), [data.fixtures]);
  const referenceById = useMemo(
    () => new Map(data.fixtures.map((fixture) => [fixture.id, fixture.displayReference])),
    [data.fixtures],
  );

  return (
    <div className="mt-5 space-y-4">
      <h3 className="font-black">Lịch fixture theo vòng</h3>
      {[...groups].map(([round, fixtures]) => (
        <section key={round}>
          <h4 className="text-sm font-bold">{roundLabel(round, data.bracket.roundCount)}</h4>
          <ul className="mt-2 space-y-2">
            {fixtures.map((fixture) => (
              <FixtureItem
                data={data}
                disabled={disabled}
                fixture={fixture}
                key={fixture.id}
                onDecide={onDecide}
                onPrepare={onPrepare}
                referenceById={referenceById}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FixtureItem({
  data,
  disabled,
  fixture,
  onDecide,
  onPrepare,
  referenceById,
}: {
  readonly data: ActiveBracket;
  readonly disabled: boolean;
  readonly fixture: BracketFixture;
  readonly onDecide: (fixture: BracketFixture) => void;
  readonly onPrepare: (id: string) => void;
  readonly referenceById: ReadonlyMap<string, string>;
}) {
  const statuses = fixture.match
    ? [presentLifecycle(fixture.match.lifecycle), presentPhase(fixture.match.phase)]
    : [presentDisplayState(fixture.displayState)];
  const decisionType = manualWinnerDecisionType(fixture);
  const decidable = decisionType !== null && canDecideManually(fixture);

  return (
    <li className={`rounded-xl border p-3 ${fixtureSurfaceClassName(fixture)}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{fixture.displayReference}</p>
            <span className="flex flex-wrap gap-1">
              {statuses.map((status) => (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-bold ${matchVariantClassName[status.variant]}`}
                  key={status.label}
                >
                  {status.label}
                </span>
              ))}
            </span>
          </div>
          <p className="mt-1 break-words text-sm font-medium">
            <span className="text-red-700">{fixtureSideLabel(fixture, 'RED', referenceById)}</span>
            <span className="px-2 text-muted-foreground">vs</span>
            <span className="text-blue-700">
              {fixtureSideLabel(fixture, 'BLUE', referenceById)}
            </span>
          </p>
          {fixture.winnerEntrant ? (
            <p className="text-sm">Người thắng: {fixture.winnerEntrant.snapshotName}</p>
          ) : null}
          {fixture.winnerDecision?.reason ? (
            <p className="break-words text-sm text-muted-foreground">
              Lý do: {fixture.winnerDecision.reason}
            </p>
          ) : null}
          {fixture.roundNumber === data.bracket.roundCount && data.bracket.championEntrant ? (
            <p className="text-sm font-bold">
              Vô địch: {data.bracket.championEntrant.snapshotName}
            </p>
          ) : null}
          {fixture.displayState === MatchDisplayState.NOT_READY ? (
            <p className="text-sm text-muted-foreground">Đang chờ kết quả các trận trước.</p>
          ) : null}
          {decidable ? (
            <p className="text-sm text-muted-foreground">
              {decisionType === 'WITHDRAWAL_OR_INJURY'
                ? 'Có thể xác nhận người thắng do rút lui hoặc chấn thương.'
                : 'Chờ xác định người thắng.'}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {fixture.status === 'READY' ? (
            <Button
              disabled={disabled}
              onClick={() => {
                onPrepare(fixture.id);
              }}
              size="sm"
              type="button"
            >
              <ClipboardCheck aria-hidden="true" className="mr-1 size-4" />
              Chuẩn bị trận
            </Button>
          ) : null}
          {fixture.match &&
          (fixture.status === 'MATCH_PREPARED' ||
            fixture.match.lifecycle === MatchLifecycle.COMPLETED) ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/matches/${fixture.match.id}`}>
                <Eye aria-hidden="true" className="mr-1 size-4" />
                {`Chi tiết trận ${fixture.match.publicId}`}
              </Link>
            </Button>
          ) : null}
          {decidable ? (
            <Button
              aria-label="Chỉ định VĐV chiến thắng"
              title="Chỉ định VĐV chiến thắng"
              className="w-9 border-0 bg-amber-600 px-0 text-yellow-300 hover:bg-amber-300 hover:text-yellow-800 hover:shadow-lg"
              disabled={disabled}
              onClick={() => {
                onDecide(fixture);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Crown aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
