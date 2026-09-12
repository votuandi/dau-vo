import type { ActiveBracket, BracketPreview } from '@/services/api/admin-management';

type ChartData = Pick<BracketPreview, 'rounds' | 'initialEntrants'> | ActiveBracket;
function preview(data: ChartData): data is Pick<BracketPreview, 'rounds' | 'initialEntrants'> { return 'rounds' in data; }
export function BracketChart({ data }: { readonly data: ChartData }) {
  const entrantById = new Map((preview(data) ? data.initialEntrants.flatMap((x) => x.athlete ? [[x.athleteId!, x.athlete] as const] : []) : data.entrants.map((x) => [x.id, { name: x.snapshotName, organizationName: x.snapshotOrganization, imageUrl: x.snapshotImagePath ? `/api/media/${x.snapshotImagePath}` : null }] as const)));
  const rounds = preview(data) ? data.rounds : Array.from({ length: data.bracket.roundCount }, (_, index) => ({ roundNumber: index + 1, label: index + 1 === data.bracket.roundCount ? 'Chung kết' : `Vòng ${index + 1}`, fixtures: data.fixtures.filter((fixture) => fixture.roundNumber === index + 1) }));
  return <div className="overflow-x-auto rounded-xl border bg-muted/20 p-4" aria-label="Sơ đồ nhánh đấu">
    <div className="flex min-w-max items-stretch gap-5">
      {rounds.map((round) => <section className="w-72 shrink-0" key={round.roundNumber}><h4 className="mb-3 font-black">{round.label}</h4><div className="flex min-h-full flex-col justify-around gap-4">
        {round.fixtures.map((fixture) => { const activeFixture = preview(data) ? null : fixture as ActiveBracket['fixtures'][number]; return <article className="rounded-lg border bg-card shadow-sm" key={fixture.id}><p className="border-b px-3 py-2 text-xs font-bold text-muted-foreground">{fixture.displayReference}</p>{fixture.slots.map((slot) => {
          const isPreviewSlot = 'resolvedEntrantId' in slot;
          const entrant = isPreviewSlot ? (slot.resolvedEntrantId ? entrantById.get(slot.resolvedEntrantId) : undefined) : (slot.resolvedEntrant ?? slot.directEntrant);
          const waiting = !entrant && !isPreviewSlot && slot.sourceFixtureId ? `Chờ thắng trận` : !entrant && isPreviewSlot && slot.source.kind === 'FIXTURE_WINNER' ? 'Chờ thắng trận' : 'Đặc cách';
          return <div className={`flex min-h-14 items-center gap-2 border-l-4 px-3 py-2 ${slot.side === 'RED' ? 'border-l-red-500' : 'border-l-blue-500'}`} key={slot.side}>
            {entrant && 'imageUrl' in entrant && entrant.imageUrl ? <img alt="" className="size-8 rounded-full object-cover" src={entrant.imageUrl} /> : null}<div className="min-w-0"><span className="text-xs font-bold">{slot.side}</span><p className="truncate text-sm font-semibold">{entrant ? ('name' in entrant ? entrant.name : entrant.snapshotName) : waiting}</p>{entrant ? <p className="truncate text-xs text-muted-foreground">{'organizationName' in entrant ? entrant.organizationName : entrant.snapshotOrganization ?? 'Không đơn vị'}</p> : null}</div>
          </div>;})}{activeFixture?.winnerEntrant ? <p className="border-t px-3 py-2 text-sm font-bold">Thắng: {activeFixture.winnerEntrant.snapshotName}</p> : null}{activeFixture?.status === 'AWAITING_WINNER' ? <p className="border-t px-3 py-2 text-sm text-muted-foreground">Chờ xác định người thắng</p> : null}</article>; })}
      </div></section>)}
    </div>
  </div>;
}
