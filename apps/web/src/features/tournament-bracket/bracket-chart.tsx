import type {
  ActiveBracket,
  BracketFixture,
  BracketPreview,
} from '@/services/api/admin-management';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Pencil, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isBracketPreview } from './bracket-graph';
import { bracketChartPresentation } from './bracket-chart-presentation';
import {
  matchVariantClassName,
  presentDisplayState,
  presentLifecycle,
  presentPhase,
} from '@/features/match-presentation';
import { swappablePreviewAthleteIds } from './bracket-preview-swap';
import {
  BRACKET_LAYOUT,
  bracketConnectorPath,
  fixtureTopOffsets,
  measuredFixtureRowPitch,
} from './bracket-chart-layout';

type ChartData = Pick<BracketPreview, 'rounds' | 'initialEntrants'> | ActiveBracket;
interface ConnectorPath {
  readonly key: string;
  readonly d: string;
  readonly winnerSide: 'RED' | 'BLUE' | null;
}

function winnerSideOfFixture(fixture: ActiveBracket['fixtures'][number]): 'RED' | 'BLUE' | null {
  if (!fixture.winnerEntrant) return null;

  return (
    fixture.slots.find(
      (slot) => (slot.resolvedEntrant ?? slot.directEntrant)?.id === fixture.winnerEntrant?.id,
    )?.side ?? null
  );
}

function winnerBorderClassName(side: 'RED' | 'BLUE' | null): string {
  if (side === 'RED') return 'border-red-500';
  if (side === 'BLUE') return 'border-blue-500';
  return 'border-border';
}

function winnerSurfaceClassName(side: 'RED' | 'BLUE' | null): string {
  if (side === 'RED') return 'bg-red-500 text-white';
  if (side === 'BLUE') return 'bg-blue-500 text-white';
  return '';
}

export function BracketChart({
  data,
  onEditAthlete,
  onDecideWinner,
  decisionDisabled = false,
}: {
  readonly data: ChartData;
  readonly onEditAthlete?: (athleteId: string) => void;
  readonly onDecideWinner?: (fixture: ActiveBracket['fixtures'][number], entrantId: string) => void;
  readonly decisionDisabled?: boolean;
}) {
  const isPreview = isBracketPreview(data);
  const graph = useMemo(() => bracketChartPresentation(data), [data]);
  const winnerSideByFixtureId = useMemo(
    () =>
      new Map(
        isPreview
          ? []
          : data.fixtures.map((fixture) => [fixture.id, winnerSideOfFixture(fixture)] as const),
      ),
    [data, isPreview],
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const fixtureRefs = useRef(new Map<string, HTMLElement>());
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<readonly ConnectorPath[]>([]);
  const [rowPitch, setRowPitch] = useState<number>(BRACKET_LAYOUT.rowPitch);
  const entrantById = new Map(
    isPreview
      ? data.initialEntrants.flatMap((x) =>
          x.athlete && x.athleteId ? [[x.athleteId, x.athlete] as const] : [],
        )
      : data.entrants.map(
          (x) =>
            [
              x.id,
              {
                id: x.athleteId ?? x.id,
                name: x.snapshotName,
                organizationName: x.snapshotOrganization,
                imageUrl: x.snapshotImagePath ? `/api/media/${x.snapshotImagePath}` : null,
                isSeed: x.isSeed ?? false,
              },
            ] as const,
        ),
  );
  const swappableAthleteIds = useMemo(
    () => (isPreview ? swappablePreviewAthleteIds(data.initialEntrants) : new Set<string>()),
    [data, isPreview],
  );
  const fixtureReferenceById = new Map<string, string>(
    isPreview
      ? data.rounds.flatMap((round) =>
          round.fixtures.map((fixture) => [fixture.id, fixture.displayReference] as const),
        )
      : data.fixtures.map((fixture) => [fixture.id, fixture.displayReference] as const),
  );
  const rounds = graph.rounds;
  const fixtureOffsets = useMemo(() => fixtureTopOffsets(rounds, rowPitch), [rounds, rowPitch]);
  const chartHeight = Math.max(
    280,
    ...Array.from(fixtureOffsets.values(), (offset) => offset + rowPitch),
  );

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const content = contentRef.current;
        if (!content) return;
        const fixtureMeasurements = Array.from(
          fixtureRefs.current.values(),
          (element: HTMLElement): { roundNumber: number; height: number } => ({
            roundNumber: Number(element.dataset.roundNumber),
            height: Math.ceil(element.getBoundingClientRect().height),
          }),
        );
        const measuredPitch: number = measuredFixtureRowPitch(fixtureMeasurements);
        if (measuredPitch !== rowPitch) {
          setRowPitch(measuredPitch);
          return;
        }
        const contentBounds = content.getBoundingClientRect();
        setPaths(
          graph.edges.flatMap((edge) => {
            const source = fixtureRefs.current.get(edge.sourceFixtureId);
            const target = slotRefs.current.get(`${edge.targetFixtureId}:${edge.targetSide}`);
            if (!source || !target) return [];
            const sourceBounds = source.getBoundingClientRect();
            const targetBounds = target.getBoundingClientRect();
            const startX = sourceBounds.right - contentBounds.left;
            const startY = sourceBounds.top + sourceBounds.height / 2 - contentBounds.top;
            const endX = targetBounds.left - contentBounds.left;
            const endY = targetBounds.top + targetBounds.height / 2 - contentBounds.top;
            return [
              {
                key: `${edge.sourceFixtureId}:${edge.targetFixtureId}:${edge.targetSide}`,
                d: bracketConnectorPath({
                  sourceRight: startX,
                  sourceCenterY: startY,
                  targetLeft: endX,
                  targetCenterY: endY,
                  targetSide: edge.targetSide,
                }),
                winnerSide: winnerSideByFixtureId.get(edge.sourceFixtureId) ?? null,
              },
            ];
          }),
        );
      });
    };
    schedule();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    if (observer) {
      if (contentRef.current) observer.observe(contentRef.current);
      fixtureRefs.current.forEach((element) => {
        observer.observe(element);
      });
      slotRefs.current.forEach((element) => {
        observer.observe(element);
      });
    }
    // Font Loading API is absent in a few supported browser/test environments.
    // The first scheduled measurement is still sufficient there.
    const fontSet = (document as Partial<Document>).fonts;
    fontSet?.ready.then(schedule).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [graph, winnerSideByFixtureId, rowPitch]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/20 p-4" aria-label="Sơ đồ nhánh đấu">
      <div
        className="relative flex min-w-max items-stretch"
        ref={contentRef}
        style={{
          columnGap: `${String(BRACKET_LAYOUT.roundGap)}px`,
          minHeight: `${String(chartHeight)}px`,
        }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible"
          preserveAspectRatio="none"
        >
          {paths.map((path) => (
            <path
              className={
                path.winnerSide === 'RED'
                  ? 'stroke-red-500'
                  : path.winnerSide === 'BLUE'
                    ? 'stroke-blue-500'
                    : 'stroke-muted-foreground/50 dark:stroke-muted-foreground/70'
              }
              d={path.d}
              fill="none"
              key={path.key}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {rounds.map((round) => (
          <section
            className="relative z-10 shrink-0"
            key={round.roundNumber}
            style={{ width: `${String(BRACKET_LAYOUT.fixtureWidth)}px` }}
          >
            <h4 className="sticky left-0 top-0 z-10 mb-2 bg-muted/95 py-1 text-sm font-black">
              {round.label}
            </h4>
            <div className="relative pt-8" style={{ minHeight: `${String(chartHeight)}px` }}>
              {round.fixtures.map((fixture) => {
                const isBye = graph.byeIds.has(fixture.id);
                const activeFixture =
                  isPreview || isBye ? null : (fixture as ActiveBracket['fixtures'][number]);
                const winnerSide = activeFixture ? winnerSideOfFixture(activeFixture) : null;
                return (
                  <article
                    className={`absolute left-0 w-full overflow-hidden rounded-lg border bg-card shadow-sm ${winnerBorderClassName(winnerSide)}`}
                    data-fixture-id={fixture.id}
                    data-round-number={round.roundNumber}
                    key={fixture.id}
                    ref={(element) => {
                      if (element) fixtureRefs.current.set(fixture.id, element);
                      else fixtureRefs.current.delete(fixture.id);
                    }}
                    style={{ top: `${String(fixtureOffsets.get(fixture.id) ?? 0)}px` }}
                  >
                    {isBye ? (
                      <header className="flex justify-end border-b px-2 py-1">
                        <span className="rounded-full border border-yellow-300 bg-yellow-100 px-1 py-0.5 text-[10px] font-bold text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300">
                          Đặc cách
                        </span>
                      </header>
                    ) : activeFixture ? (
                      (() => {
                        const statuses = activeFixture.match
                          ? [
                              presentLifecycle(activeFixture.match.lifecycle),
                              presentPhase(activeFixture.match.phase),
                            ]
                          : [presentDisplayState(activeFixture.displayState)];
                        return (
                          <header className="flex flex-wrap items-center justify-between gap-1 border-b px-2 py-1">
                            <p className="text-xs font-bold text-muted-foreground">
                              {fixture.displayReference}
                            </p>
                            <span className="flex flex-wrap justify-end gap-1">
                              {statuses.map((status) => (
                                <span
                                  className={`rounded-full border px-1 py-0.5 text-[10px] font-bold ${matchVariantClassName[status.variant]}`}
                                  key={status.label}
                                >
                                  {status.label}
                                </span>
                              ))}
                            </span>
                          </header>
                        );
                      })()
                    ) : (
                      <header className="border-b px-2 py-1.5">
                        <p className="text-xs font-bold text-muted-foreground">
                          {fixture.displayReference}
                        </p>
                      </header>
                    )}
                    {fixture.slots.map((slot) => {
                      // Confirmed slots retain Prisma's `resolvedEntrantId`
                      // scalar, so it cannot distinguish preview and persisted
                      // responses. The outer payload shape does.
                      const previewSlot = slot as BracketFixture['slots'][number];
                      const activeSlot = slot as ActiveBracket['fixtures'][number]['slots'][number];
                      const entrant = isPreview
                        ? previewSlot.resolvedEntrantId
                          ? entrantById.get(previewSlot.resolvedEntrantId)
                          : undefined
                        : (activeSlot.resolvedEntrant ?? activeSlot.directEntrant);
                      const isWinner = Boolean(
                        entrant && activeFixture?.winnerEntrant?.id === entrant.id,
                      );
                      const waiting =
                        !entrant && !isPreview && activeSlot.sourceFixtureId
                          ? `Chờ người thắng ${fixtureReferenceById.get(activeSlot.sourceFixtureId) ?? ''}`
                          : !entrant && isPreview && previewSlot.source.kind === 'FIXTURE_WINNER'
                            ? `Chờ người thắng ${fixtureReferenceById.get(previewSlot.source.fixtureId ?? '') ?? ''}`
                            : 'Đặc cách';
                      const editableAthleteId =
                        onEditAthlete &&
                        isPreview &&
                        previewSlot.source.kind === 'ENTRANT' &&
                        previewSlot.resolvedEntrantId &&
                        swappableAthleteIds.has(previewSlot.resolvedEntrantId)
                          ? previewSlot.resolvedEntrantId
                          : null;
                      return (
                        <div
                          className={`group/athlete relative flex min-h-10 items-center gap-1.5 border-l-4 px-1.5 py-0.5 ${isBye ? 'border-l-green-500 bg-green-50 dark:bg-green-950/20' : `${slot.side === 'RED' ? 'border-l-red-500' : 'border-l-blue-500'} ${isWinner ? winnerSurfaceClassName(winnerSide) : slot.side === 'RED' ? 'bg-red-50/50 dark:bg-red-950/20' : 'bg-blue-50/50 dark:bg-blue-950/20'}`}`}
                          data-fixture-slot={`${fixture.id}:${slot.side}`}
                          key={slot.side}
                          ref={(element) => {
                            const key = `${fixture.id}:${slot.side}`;
                            if (element) slotRefs.current.set(key, element);
                            else slotRefs.current.delete(key);
                          }}
                        >
                          {entrant && 'imageUrl' in entrant && entrant.imageUrl ? (
                            <img
                              alt=""
                              className="size-7 shrink-0 rounded-full object-cover"
                              src={entrant.imageUrl}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <span className="sr-only">
                              {isBye ? 'VĐV đặc cách' : slot.side === 'RED' ? 'Bên đỏ' : 'Bên xanh'}
                            </span>
                            <p className="break-words text-sm font-semibold leading-4">
                              {entrant ? (
                                <span className="inline-flex items-center gap-1">
                                  {'name' in entrant ? entrant.name : entrant.snapshotName}
                                  {entrant.isSeed ? (
                                    <span aria-label="VĐV hạt giống" title="VĐV hạt giống">
                                      <Star
                                        aria-hidden="true"
                                        className="size-4 fill-yellow-400 text-yellow-500"
                                      />
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                waiting
                              )}
                            </p>
                            {entrant ? (
                              <p
                                className={`break-words text-[10px] ${isWinner ? 'text-white' : 'text-muted-foreground'}`}
                              >
                                {'organizationName' in entrant
                                  ? entrant.organizationName
                                  : (entrant.snapshotOrganization ?? 'Không đơn vị')}
                              </p>
                            ) : null}
                          </div>
                          {activeFixture &&
                          entrant &&
                          onDecideWinner &&
                          manualWinnerCandidates(activeFixture).length === 2 ? (
                            <Button
                              aria-label={`Chỉ định VĐV chiến thắng trận: ${'name' in entrant ? entrant.name : entrant.snapshotName} (${activeFixture.displayReference})`}
                              title="Chỉ định VĐV chiến thắng trận"
                              className="absolute right-1.5 z-10 size-8 border border-yellow-400 bg-yellow-100 text-yellow-700 hover:border-yellow-500 hover:bg-yellow-200 hover:text-yellow-800 opacity-0 pointer-events-none group-hover/athlete:opacity-100 group-hover/athlete:pointer-events-auto group-focus-within/athlete:opacity-100 group-focus-within/athlete:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                              disabled={decisionDisabled}
                              onClick={() => {
                                onDecideWinner(activeFixture, entrant.id);
                              }}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Crown aria-hidden="true" className="size-4" />
                            </Button>
                          ) : null}
                          {editableAthleteId ? (
                            <Button
                              aria-label={`Đổi vị trí ${entrant ? ('name' in entrant ? entrant.name : entrant.snapshotName) : 'vận động viên'}`}
                              className="shrink-0"
                              onClick={() => {
                                onEditAthlete?.(editableAthleteId);
                              }}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                    {activeFixture?.winnerDecision?.reason ? (
                      <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">
                        Lý do: {activeFixture.winnerDecision.reason}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function manualWinnerCandidates(fixture: ActiveBracket['fixtures'][number]) {
  return manualWinnerDecisionType(fixture)
    ? fixture.slots.flatMap((slot) => (slot.resolvedEntrant ? [slot.resolvedEntrant] : []))
    : [];
}

function manualWinnerDecisionType(fixture: ActiveBracket['fixtures'][number]) {
  if (fixture.status === 'AWAITING_WINNER') return 'ADMIN_TIEBREAK';
  if (fixture.status === 'READY' && fixture.match === null) return 'WITHDRAWAL_OR_INJURY';
  return null;
}
