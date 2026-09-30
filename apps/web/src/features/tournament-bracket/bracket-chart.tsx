import type {
  ActiveBracket,
  BracketFixture,
  BracketPreview,
} from '@/services/api/admin-management';
import { bracketRoundLabel, MatchLifecycle } from '@martial-arts-scoring/shared-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bracketPresentation, isBracketPreview } from './bracket-graph';
import {
  matchVariantClassName,
  presentDisplayState,
  presentLifecycle,
  presentPhase,
} from '@/features/match-presentation';

type ChartData = Pick<BracketPreview, 'rounds' | 'initialEntrants'> | ActiveBracket;
interface ConnectorPath {
  readonly key: string;
  readonly d: string;
}

const FIXTURE_VERTICAL_GAP = 224;

function fixtureTopOffsets(
  rounds: readonly {
    readonly fixtures: readonly { readonly id: string; readonly position: number }[];
  }[],
  edges: ReturnType<typeof bracketPresentation>['edges'],
): ReadonlyMap<string, number> {
  const offsets = new Map<string, number>();
  for (const [roundIndex, round] of rounds.entries()) {
    const fixtures = [...round.fixtures].sort((a, b) => a.position - b.position);
    const incoming = new Map<string, string[]>();
    edges.forEach((edge) => {
      if (fixtures.some((fixture) => fixture.id === edge.targetFixtureId)) {
        incoming.set(edge.targetFixtureId, [
          ...(incoming.get(edge.targetFixtureId) ?? []),
          edge.sourceFixtureId,
        ]);
      }
    });
    fixtures.forEach((fixture, index) => {
      const sourceOffsets = (incoming.get(fixture.id) ?? [])
        .map((sourceId) => offsets.get(sourceId))
        .filter((offset): offset is number => offset !== undefined);
      offsets.set(
        fixture.id,
        sourceOffsets.length > 0
          ? sourceOffsets.reduce((total, offset) => total + offset, 0) / sourceOffsets.length
          : (roundIndex === 0 ? index : index * 2 ** roundIndex) * FIXTURE_VERTICAL_GAP,
      );
    });
  }
  return offsets;
}

export function BracketChart({ data }: { readonly data: ChartData }) {
  const isPreview = isBracketPreview(data);
  const graph = useMemo(() => bracketPresentation(data), [data]);
  const contentRef = useRef<HTMLDivElement>(null);
  const fixtureRefs = useRef(new Map<string, HTMLElement>());
  const slotRefs = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<readonly ConnectorPath[]>([]);
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
                name: x.snapshotName,
                organizationName: x.snapshotOrganization,
                imageUrl: x.snapshotImagePath ? `/api/media/${x.snapshotImagePath}` : null,
              },
            ] as const,
        ),
  );
  const fixtureReferenceById = new Map<string, string>(
    isPreview
      ? data.rounds.flatMap((round) =>
          round.fixtures.map((fixture) => [fixture.id, fixture.displayReference] as const),
        )
      : data.fixtures.map((fixture) => [fixture.id, fixture.displayReference] as const),
  );
  const rounds = isPreview
    ? data.rounds
    : Array.from({ length: data.bracket.roundCount }, (_, index) => ({
        roundNumber: index + 1,
        label: bracketRoundLabel(index + 1, data.bracket.roundCount),
        fixtures: data.fixtures.filter((fixture) => fixture.roundNumber === index + 1),
      }));
  const fixtureOffsets = useMemo(
    () => fixtureTopOffsets(rounds, graph.edges),
    [graph.edges, rounds],
  );
  const chartHeight = Math.max(
    280,
    ...Array.from(fixtureOffsets.values(), (offset) => offset + FIXTURE_VERTICAL_GAP),
  );

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const content = contentRef.current;
        if (!content) return;
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
            const middleX =
              startX + Math.max(28, endX - startX) * (edge.targetSide === 'RED' ? 0.38 : 0.62);
            return [
              {
                key: `${edge.sourceFixtureId}:${edge.targetFixtureId}:${edge.targetSide}`,
                d: `M ${String(startX)} ${String(startY)} H ${String(middleX)} V ${String(endY)} H ${String(endX)}`,
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
    document.fonts.ready.then(schedule).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [graph]);

  return (
    <div className="overflow-x-auto rounded-xl border bg-muted/20 p-4" aria-label="Sơ đồ nhánh đấu">
      <div
        className="relative flex min-w-max items-stretch gap-24"
        ref={contentRef}
        style={{ minHeight: `${String(chartHeight)}px` }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible"
          preserveAspectRatio="none"
        >
          {paths.map((path) => (
            <path
              className="stroke-muted-foreground/50 dark:stroke-muted-foreground/70"
              d={path.d}
              fill="none"
              key={path.key}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {rounds.map((round) => (
          <section className="relative z-10 w-72 shrink-0" key={round.roundNumber}>
            <h4 className="sticky left-0 top-0 z-10 mb-3 bg-muted/95 py-1 font-black">
              {round.label}
            </h4>
            <div className="relative pt-10" style={{ minHeight: `${String(chartHeight)}px` }}>
              {round.fixtures.map((fixture) => {
                const activeFixture = isPreview
                  ? null
                  : (fixture as ActiveBracket['fixtures'][number]);
                return (
                  <article
                    className="absolute left-0 w-full rounded-lg border bg-card shadow-sm"
                    data-fixture-id={fixture.id}
                    key={fixture.id}
                    ref={(element) => {
                      if (element) fixtureRefs.current.set(fixture.id, element);
                      else fixtureRefs.current.delete(fixture.id);
                    }}
                    style={{ top: `${String(fixtureOffsets.get(fixture.id) ?? 0)}px` }}
                  >
                    {activeFixture ? (
                      (() => {
                        const statuses = activeFixture.match
                          ? [
                              presentLifecycle(activeFixture.match.lifecycle),
                              presentPhase(activeFixture.match.phase),
                            ]
                          : [presentDisplayState(activeFixture.displayState)];
                        return (
                          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                            <p className="text-xs font-bold text-muted-foreground">
                              {fixture.displayReference}
                            </p>
                            <span className="flex flex-wrap justify-end gap-1">
                              {statuses.map((status) => (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-xs font-bold ${matchVariantClassName[status.variant]}`}
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
                      <header className="border-b px-3 py-2">
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
                      const waiting =
                        !entrant && !isPreview && activeSlot.sourceFixtureId
                          ? `Chờ người thắng ${fixtureReferenceById.get(activeSlot.sourceFixtureId) ?? ''}`
                          : !entrant && isPreview && previewSlot.source.kind === 'FIXTURE_WINNER'
                            ? `Chờ người thắng ${fixtureReferenceById.get(previewSlot.source.fixtureId ?? '') ?? ''}`
                            : 'Đặc cách';
                      return (
                        <div
                          className={`flex min-h-14 items-center gap-2 border-l-4 px-3 py-2 ${slot.side === 'RED' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20' : 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20'}`}
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
                              className="size-8 rounded-full object-cover"
                              src={entrant.imageUrl}
                            />
                          ) : null}
                          <div className="min-w-0">
                            <span className="sr-only">
                              {slot.side === 'RED' ? 'Bên đỏ' : 'Bên xanh'}
                            </span>
                            <p className="line-clamp-2 text-sm font-semibold">
                              {entrant
                                ? 'name' in entrant
                                  ? entrant.name
                                  : entrant.snapshotName
                                : waiting}
                            </p>
                            {entrant ? (
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {'organizationName' in entrant
                                  ? entrant.organizationName
                                  : (entrant.snapshotOrganization ?? 'Không đơn vị')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {activeFixture?.winnerEntrant &&
                    activeFixture.match?.lifecycle === MatchLifecycle.COMPLETED ? (
                      <p className="border-t px-3 py-2 text-sm font-bold">
                        Thắng: {activeFixture.winnerEntrant.snapshotName}
                      </p>
                    ) : null}
                    {activeFixture?.status === 'AWAITING_WINNER' ? (
                      <p className="border-t px-3 py-2 text-sm text-muted-foreground">
                        Chờ xác định người thắng
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
