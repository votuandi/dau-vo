import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { BracketDrawSetup } from '@/services/api/admin-management';
type Strategy = 'RANDOM' | 'MANUAL' | 'SEEDED';

export function shuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex]!, shuffled[index]!];
  }
  return shuffled;
}

export function BracketDrawSetupDialog({
  setup,
  selectedIds,
  pending,
  error,
  onReload,
  onClose,
  onSubmit,
}: {
  readonly setup: BracketDrawSetup;
  readonly selectedIds: readonly string[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly onReload: () => void;
  readonly onClose: () => void;
  readonly onSubmit: (ids: readonly string[], strategy: Strategy) => void;
}) {
  const byeCount = setup.summary.byeCount;
  const seeds = useMemo(() => setup.eligibleAthletes.filter((x) => x.isSeed), [setup]);
  const [strategy, setStrategy] = useState<Strategy>('RANDOM');
  const [selected, setSelected] = useState<readonly string[]>(selectedIds);
  const [search, setSearch] = useState('');
  const randomRef = useRef<HTMLInputElement>(null);
  const seeded = strategy === 'SEEDED';
  const seedIds = seeds.map((x) => x.id);
  const shortage = seeds.length < byeCount;
  const pool = seeded
    ? shortage
      ? setup.eligibleAthletes.filter((x) => !seedIds.includes(x.id))
      : seeds
    : setup.eligibleAthletes;
  const athletes = pool.filter(
    (x) =>
      !search.trim() ||
      `${x.name} ${x.organizationName ?? ''}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const remaining = byeCount - selected.length;
  const toggle = (id: string) => {
    setSelected((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : old.length < byeCount ? [...old, id] : old,
    );
  };
  const selectRandomRemaining = () => {
    setSelected((old) => [
      ...old,
      ...shuffle(pool.filter((x) => !old.includes(x.id)))
        .slice(0, byeCount - old.length)
        .map((x) => x.id),
    ]);
  };
  const change = (value: Strategy) => {
    setStrategy(value);
    setSelected(value === 'SEEDED' && seeds.length <= byeCount ? seedIds : []);
  };
  const manualList = strategy === 'MANUAL' || (seeded && seeds.length !== byeCount);
  return (
    <Dialog
      className="max-w-2xl"
      description={`Nhánh đấu này sẽ có ${String(setup.summary.roundCount)} vòng, tổng cộng ${String(setup.summary.totalFixtureCount)} trận và ${String(byeCount)} vận động viên được đặc cách.`}
      initialFocusRef={randomRef}
      onClose={onClose}
      pending={pending}
      title="Thiết lập bốc thăm"
    >
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-5">
        {[
          ['VĐV', setup.summary.athleteCount],
          ['Trận vòng 1', setup.summary.firstRoundFixtureCount],
          ['Tổng trận', setup.summary.totalFixtureCount],
          ['Vòng', setup.summary.roundCount],
          ['Đặc cách', byeCount],
        ].map(([l, v]) => (
          <div key={String(l)}>
            <dt className="text-muted-foreground">{l}</dt>
            <dd className="font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      {error ? (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
          <Button
            className="ml-3"
            disabled={pending}
            onClick={() => {
              onReload();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Tải lại danh sách
          </Button>
        </div>
      ) : null}
      {byeCount === 0 ? (
        <p className="mt-4 rounded-lg border p-3 text-sm text-muted-foreground">
          Không có vận động viên nào được đặc cách vì số lượng VĐV vừa đủ.
        </p>
      ) : (
        <fieldset className="mt-4" disabled={pending}>
          <legend className="font-bold">Cách chọn đặc cách</legend>
          {(
            [
              ['RANDOM', 'Đặc cách ngẫu nhiên'],
              ['MANUAL', 'Chỉ định vận động viên'],
              ['SEEDED', 'Đặc cách hạt giống'],
            ] as const
          ).map(([v, l]) => (
            <label
              className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm"
              key={v}
            >
              <input
                checked={strategy === v}
                name="bye-mode"
                onChange={() => {
                  change(v);
                }}
                ref={v === 'RANDOM' ? randomRef : undefined}
                type="radio"
              />
              {l}
            </label>
          ))}
          {seeded ? (
            <div className="mt-3 rounded-lg border p-3 text-sm">
              {seeds.length === byeCount ? (
                <p>Tự động chọn toàn bộ vận động viên Hạt giống.</p>
              ) : seeds.length > byeCount ? (
                <p role="alert">
                  Số lượng vận động viên Hạt giống hiện đang nhiều hơn số lượt đặt cách. Hãy chọn
                  thủ công.
                </p>
              ) : (
                <>
                  <p role="alert">
                    Số lượng vận động viên Hạt giống hiện đang ít hơn số lượt đặt cách. Hãy chọn
                    thêm.
                  </p>
                  <Button
                    className="mt-2"
                    disabled={remaining === 0}
                    onClick={selectRandomRemaining}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Chọn ngẫu nhiên {remaining} vận động viên còn thiếu
                  </Button>
                </>
              )}
            </div>
          ) : null}
          {manualList ? (
            <div className="mt-3">
              <label className="text-sm font-bold" htmlFor="bye-athlete-search">
                {seeded && shortage ? 'Chọn thêm thủ công' : 'Tìm vận động viên'}
              </label>
              <input
                className="mt-1 w-full rounded-lg border bg-background p-2"
                id="bye-athlete-search"
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                placeholder="Tên hoặc đơn vị"
                type="search"
                value={search}
              />
              <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                Cần {byeCount} · Đã chọn {selected.length} · Còn thiếu {remaining}
              </p>
              <div
                aria-label="Danh sách vận động viên"
                className="mt-2 max-h-56 space-y-2 overflow-y-auto"
              >
                {athletes.map((x) => {
                  const checked = selected.includes(x.id);
                  return (
                    <label
                      className="flex items-center gap-3 rounded-lg border bg-background p-2 text-sm"
                      key={x.id}
                    >
                      <input
                        aria-label={`Chọn ${x.name}`}
                        checked={checked}
                        disabled={!checked && selected.length >= byeCount}
                        onChange={() => {
                          toggle(x.id);
                        }}
                        type="checkbox"
                      />
                      <span>
                        <span className="block font-semibold">{x.name}</span>
                        <span className="text-muted-foreground">
                          {x.organizationName ?? 'Chưa có đơn vị'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </fieldset>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Button
          disabled={pending}
          onClick={() => {
            onClose();
          }}
          type="button"
          variant="outline"
        >
          Hủy
        </Button>
        <Button
          disabled={pending || (seeded && selected.length !== byeCount)}
          onClick={() => {
            onSubmit(strategy === 'RANDOM' ? [] : selected, strategy);
          }}
          type="button"
        >
          {pending ? 'Đang bốc thăm…' : 'Xác nhận và bốc thăm'}
        </Button>
      </div>
    </Dialog>
  );
}
