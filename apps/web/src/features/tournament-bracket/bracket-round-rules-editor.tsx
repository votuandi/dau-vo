import { useState } from 'react';
import { ScoringMethod } from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import type { ActiveBracket, BracketRoundRuleSettings } from '@/services/api/admin-management';

type Settings = NonNullable<ActiveBracket['staffing']>[number];

const scoringMethodLabels: Record<ScoringMethod, string> = {
  [ScoringMethod.JUDGE_FREE_WINDOW]: 'Giám định chấm điểm tự do trong 1.5 giây',
  [ScoringMethod.REFEREE_COMMAND]: 'Giám định chấm điểm theo hiệu lệnh trọng tài',
};

const scoringMethods = [ScoringMethod.JUDGE_FREE_WINDOW, ScoringMethod.REFEREE_COMMAND] as const;

function isScoringMethod(value: string): value is ScoringMethod {
  return (scoringMethods as readonly string[]).includes(value);
}

export function BracketRoundRulesEditor({
  data,
  disabled,
  pending,
  onSave,
}: {
  readonly data: ActiveBracket;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSave: (roundNumber: number, settings: BracketRoundRuleSettings) => void;
}) {
  return (
    <section className="rounded-xl border p-4" aria-label="Cấu hình thi đấu theo vòng">
      <h3 className="font-bold">Số hiệp và thời lượng theo vòng</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Áp dụng cho mọi trận trong cùng vòng của hạng cân này. Thời lượng tính cho mỗi hiệp. Cấu
        hình khóa khi Giám sát nhận một trận trong vòng.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {(data.staffing ?? []).map((row) => {
          const locked = data.fixtures.some(
            (fixture) =>
              fixture.roundNumber === row.roundNumber &&
              (fixture.match !== null ||
                ['MATCH_PREPARED', 'AWAITING_WINNER', 'COMPLETED'].includes(fixture.status)),
          );
          return (
            <RoundRulesForm
              key={`${row.id}:${String(row.regulationRoundCount)}:${String(row.roundDurationMs)}:${String(row.scoringMethod)}`}
              row={row}
              disabled={disabled || pending || locked}
              locked={locked}
              onSave={onSave}
            />
          );
        })}
      </div>
    </section>
  );
}

function RoundRulesForm({
  row,
  disabled,
  locked,
  onSave,
}: {
  readonly row: Settings;
  readonly disabled: boolean;
  readonly locked: boolean;
  readonly onSave: (roundNumber: number, settings: BracketRoundRuleSettings) => void;
}) {
  const [count, setCount] = useState(String(row.regulationRoundCount ?? 2));
  const [seconds, setSeconds] = useState(String((row.roundDurationMs ?? 120000) / 1000));
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>(
    row.scoringMethod ?? ScoringMethod.JUDGE_FREE_WINDOW,
  );
  const valid =
    Number.isInteger(Number(count)) &&
    Number(count) >= 1 &&
    Number(count) <= 20 &&
    Number.isInteger(Number(seconds)) &&
    Number(seconds) >= 1 &&
    Number(seconds) <= 3600;
  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      aria-label={`Cấu hình ${row.roundLabel}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !disabled)
          onSave(row.roundNumber, {
            regulationRoundCount: Number(count),
            roundDurationMs: Number(seconds) * 1000,
            scoringMethod,
          });
      }}
    >
      <h4 className="font-semibold">{row.roundLabel}</h4>
      <label className="block text-sm">
        Hình thức cho điểm
        <select
          className="mt-1 w-full rounded border px-2 py-1"
          aria-label={`${row.roundLabel}: hình thức cho điểm`}
          disabled={disabled}
          value={scoringMethod}
          onChange={(event) => {
            if (isScoringMethod(event.target.value)) setScoringMethod(event.target.value);
          }}
        >
          {scoringMethods.map((method) => (
            <option key={method} value={method}>
              {scoringMethodLabels[method]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-24 flex-1 text-sm">
          Số hiệp mỗi trận
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            aria-label={`${row.roundLabel}: số hiệp`}
            type="number"
            min="1"
            max="20"
            step="1"
            required
            disabled={disabled}
            value={count}
            onChange={(event) => {
              setCount(event.target.value);
            }}
          />
        </label>
        <label className="min-w-36 flex-1 text-sm">
          Thời lượng mỗi hiệp (giây)
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            aria-label={`${row.roundLabel}: thời lượng mỗi hiệp (giây)`}
            type="number"
            min="1"
            max="3600"
            step="1"
            required
            disabled={disabled}
            value={seconds}
            onChange={(event) => {
              setSeconds(event.target.value);
            }}
          />
        </label>
        <Button size="sm" type="submit" disabled={disabled || !valid}>
          {locked ? 'Đã khóa' : 'Lưu cấu hình'}
        </Button>
      </div>
    </form>
  );
}
