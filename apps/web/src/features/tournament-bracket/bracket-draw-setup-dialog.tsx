import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { BracketDrawSetup } from '@/services/api/admin-management';

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
  readonly onSubmit: (ids: readonly string[]) => void;
}) {
  const [manual, setManual] = useState(selectedIds.length > 0);
  const [selected, setSelected] = useState<readonly string[]>(selectedIds);
  const [search, setSearch] = useState('');
  const randomRef = useRef<HTMLInputElement>(null);
  const byeCount = setup.summary.byeCount;
  const athletes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return setup.eligibleAthletes;
    return setup.eligibleAthletes.filter((athlete) =>
      `${athlete.name} ${athlete.organizationName ?? ''}`.toLocaleLowerCase().includes(term),
    );
  }, [search, setup.eligibleAthletes]);
  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < byeCount
          ? [...current, id]
          : current,
    );
  };
  const firstRoundMatches = setup.summary.firstRoundFixtureCount;

  return (
    <Dialog
      description={`Nhánh đấu này sẽ có ${String(setup.summary.roundCount)} vòng, tổng cộng ${String(setup.summary.totalFixtureCount)} trận và ${String(byeCount)} vận động viên được đặc cách. Bạn có muốn chỉ định trước vận động viên được đặc cách không?`}
      initialFocusRef={randomRef}
      onClose={onClose}
      pending={pending}
      title="Thiết lập bốc thăm"
      className="max-w-2xl"
    >
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-muted-foreground">VĐV</dt>
          <dd className="font-bold">{setup.summary.athleteCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Trận vòng 1</dt>
          <dd className="font-bold">{firstRoundMatches}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tổng trận</dt>
          <dd className="font-bold">{setup.summary.totalFixtureCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vòng</dt>
          <dd className="font-bold">{setup.summary.roundCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Đặc cách</dt>
          <dd className="font-bold">{byeCount}</dd>
        </div>
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
            onClick={onReload}
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
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              checked={!manual}
              name="bye-mode"
              onChange={() => {
                setManual(false);
              }}
              ref={randomRef}
              type="radio"
            />
            Đặc cách ngẫu nhiên
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              checked={manual}
              name="bye-mode"
              onChange={() => {
                setManual(true);
              }}
              type="radio"
            />
            Chỉ định vận động viên
          </label>
          {manual ? (
            <div className="mt-3">
              <label className="text-sm font-bold" htmlFor="bye-athlete-search">
                Tìm vận động viên
              </label>
              <input
                className="mt-1 w-full rounded-lg border bg-background p-2"
                id="bye-athlete-search"
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Tên hoặc đơn vị"
                type="search"
                value={search}
              />
              <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                Đã chọn {selected.length}/{byeCount}
              </p>
              <div
                aria-label="Danh sách vận động viên"
                className="mt-2 max-h-56 space-y-2 overflow-y-auto"
              >
                {athletes.map((athlete) => {
                  const checked = selected.includes(athlete.id);
                  return (
                    <label
                      className="flex items-center gap-3 rounded-lg border bg-background p-2 text-sm"
                      key={athlete.id}
                    >
                      <input
                        aria-label={`Chọn ${athlete.name}`}
                        checked={checked}
                        disabled={!checked && selected.length >= byeCount}
                        onChange={() => {
                          toggle(athlete.id);
                        }}
                        type="checkbox"
                      />
                      {athlete.imageUrl ? (
                        <img
                          alt=""
                          className="size-9 rounded-full object-cover"
                          src={athlete.imageUrl}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="grid size-9 place-items-center rounded-full bg-muted font-bold"
                        >
                          {athlete.name.slice(0, 1)}
                        </span>
                      )}
                      <span>
                        <span className="block font-semibold">{athlete.name}</span>
                        <span className="text-muted-foreground">
                          {athlete.organizationName ?? 'Chưa có đơn vị'}
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
        <Button disabled={pending} onClick={onClose} type="button" variant="outline">
          Hủy
        </Button>
        <Button
          disabled={pending}
          onClick={() => {
            onSubmit(manual ? selected : []);
          }}
          type="button"
        >
          {pending ? 'Đang bốc thăm…' : 'Xác nhận và bốc thăm'}
        </Button>
      </div>
    </Dialog>
  );
}
