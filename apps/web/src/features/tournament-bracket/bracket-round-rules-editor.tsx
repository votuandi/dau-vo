import { useRef, useState } from "react";
import {
  ScoringMethod,
  ScoringThreshold,
} from "@martial-arts-scoring/shared-types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type {
  ActiveBracket,
  BracketRoundRuleSettings,
} from "@/services/api/admin-management";
import {
  inputClassName,
  selectClassName,
} from "@/features/admin-management/presentation";
import {
  settingsButtonClassName,
  settingsCardClassName,
  settingsDescriptionClassName,
  settingsHintClassName,
  settingsLabelClassName,
  settingsSubCardClassName,
  settingsSubTitleClassName,
  settingsTitleClassName,
} from "./settings-card-styles";
import { scoringThresholdHint } from "./scoring-threshold-hint";

type Settings = NonNullable<ActiveBracket["staffing"]>[number];

const scoringMethodLabels: Record<ScoringMethod, string> = {
  [ScoringMethod.JUDGE_FREE_WINDOW]: "Giám định chấm điểm tự do trong 1.5 giây",
  [ScoringMethod.REFEREE_COMMAND]:
    "Giám định chấm điểm theo hiệu lệnh trọng tài",
};

const scoringMethods = [
  ScoringMethod.JUDGE_FREE_WINDOW,
  ScoringMethod.REFEREE_COMMAND,
] as const;

function isScoringMethod(value: string): value is ScoringMethod {
  return (scoringMethods as readonly string[]).includes(value);
}

const scoringThresholdLabels: Record<ScoringThreshold, string> = {
  [ScoringThreshold.MORE_THAN_HALF]:
    "Cho điểm VĐV có nhiều bình chọn hơn và số bình chọn phải lớn hơn một nửa tổng lựa chọn",
  [ScoringThreshold.AT_LEAST_HALF]:
    "Cho điểm VĐV có nhiều bình chọn hơn và số bình chọn phải lớn hơn hoặc bằng một nửa tổng lựa chọn",
};

const scoringThresholds = [
  ScoringThreshold.MORE_THAN_HALF,
  ScoringThreshold.AT_LEAST_HALF,
] as const;

function isScoringThreshold(value: string): value is ScoringThreshold {
  return (scoringThresholds as readonly string[]).includes(value);
}

/** Saves one round: its rules, plus the judge count only when it was changed. */
export type RoundSettingsSave = (
  roundNumber: number,
  settings: BracketRoundRuleSettings,
  requiredJudgeCount?: number,
) => void;

/** "Cấu hình từng vòng": one sub-card per bracket round holding all of its settings. */
export function BracketRoundRulesEditor({
  data,
  disabled,
  pending,
  onSave,
}: {
  readonly data: ActiveBracket;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly onSave: RoundSettingsSave;
}) {
  const activeRefereeCount = data.activeRefereeCount ?? 0;
  return (
    <section className={settingsCardClassName} aria-label="Cấu hình từng vòng">
      <h3 className={settingsTitleClassName}>Cấu hình từng vòng</h3>
      <p className={settingsDescriptionClassName}>
        Áp dụng cho mọi trận trong cùng vòng của hạng cân này. Thời lượng tính
        cho mỗi hiệp. Hiện có {activeRefereeCount} giám định hoạt động; mỗi trận
        cần ít nhất 1 giám định và không vượt quá số đang hoạt động. Giám biên
        luôn là 1. Cấu hình khóa khi Giám sát nhận một trận trong vòng.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(data.staffing ?? []).map((row) => {
          const locked = data.fixtures.some(
            (fixture) =>
              fixture.roundNumber === row.roundNumber &&
              (fixture.match !== null ||
                ["MATCH_PREPARED", "AWAITING_WINNER", "COMPLETED"].includes(
                  fixture.status,
                )),
          );
          return (
            <RoundRulesForm
              key={`${row.id}:${String(row.regulationRoundCount)}:${String(row.roundDurationMs)}:${String(row.scoringMethod)}:${String(row.supervisorScoringEnabled)}:${String(row.requiredJudgeCount)}:${String(row.scoringThreshold)}`}
              activeRefereeCount={activeRefereeCount}
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
  activeRefereeCount,
  row,
  disabled,
  locked,
  onSave,
}: {
  readonly activeRefereeCount: number;
  readonly row: Settings;
  readonly disabled: boolean;
  readonly locked: boolean;
  readonly onSave: RoundSettingsSave;
}) {
  const [count, setCount] = useState(String(row.regulationRoundCount ?? 2));
  const [judges, setJudges] = useState(String(row.requiredJudgeCount));
  const [seconds, setSeconds] = useState(
    String((row.roundDurationMs ?? 120000) / 1000),
  );
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>(
    row.scoringMethod ?? ScoringMethod.JUDGE_FREE_WINDOW,
  );
  const [supervisorScoring, setSupervisorScoring] = useState(
    row.supervisorScoringEnabled ?? false,
  );
  // No default: an even number of scorers needs an explicit, deliberate choice.
  const [scoringThreshold, setScoringThreshold] =
    useState<ScoringThreshold | null>(row.scoringThreshold ?? null);
  const [thresholdMissing, setThresholdMissing] = useState(false);
  const thresholdRef = useRef<HTMLSelectElement>(null);
  // The supervisor can only score alongside judges in referee-command scoring.
  const refereeCommand = scoringMethod === ScoringMethod.REFEREE_COMMAND;
  const judgeCount = Number(judges);
  // Scorers = judges + the supervisor ("TT") when it votes. The win rule only
  // matters for an even number; with an odd one both rules give the same result.
  const scorerCount =
    Number.isInteger(judgeCount) && judgeCount >= 1
      ? judgeCount + (refereeCommand && supervisorScoring ? 1 : 0)
      : null;
  const evenScorers = scorerCount !== null && scorerCount % 2 === 0;
  const valid =
    Number.isInteger(Number(count)) &&
    Number(count) >= 1 &&
    Number(count) <= 20 &&
    Number.isInteger(Number(seconds)) &&
    Number(seconds) >= 1 &&
    Number(seconds) <= 3600 &&
    Number.isInteger(Number(judges)) &&
    Number(judges) >= 1;
  return (
    <form
      className={`space-y-3 ${settingsSubCardClassName}`}
      aria-label={`Cấu hình ${row.roundLabel}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || disabled) return;
        if (evenScorers && scoringThreshold === null) {
          setThresholdMissing(true);
          thresholdRef.current?.focus();
          return;
        }
        // Rule changes must not require a full referee roster, so the judge
        // count is only sent when it was actually changed.
        onSave(
          row.roundNumber,
          {
            regulationRoundCount: Number(count),
            roundDurationMs: Number(seconds) * 1000,
            scoringMethod,
            supervisorScoringEnabled: refereeCommand && supervisorScoring,
            ...(evenScorers && scoringThreshold !== null
              ? { scoringThreshold }
              : {}),
          },
          judgeCount === row.requiredJudgeCount ? undefined : judgeCount,
        );
      }}
    >
      <h4 className={settingsSubTitleClassName}>{row.roundLabel}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={settingsLabelClassName}>
          Số hiệp mỗi trận
          <input
            className={inputClassName}
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
        <label className={settingsLabelClassName}>
          Thời lượng mỗi hiệp (giây)
          <input
            className={inputClassName}
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
        <label className={settingsLabelClassName}>
          Số giám định
          <input
            className={inputClassName}
            aria-label={`${row.roundLabel}: số giám định`}
            type="number"
            inputMode="numeric"
            min="1"
            max={activeRefereeCount || undefined}
            step="1"
            required
            disabled={disabled}
            value={judges}
            onChange={(event) => {
              setJudges(event.target.value);
            }}
          />
        </label>
      </div>
      <label className={settingsLabelClassName}>
        Hình thức cho điểm
        <select
          className={selectClassName}
          aria-label={`${row.roundLabel}: hình thức cho điểm`}
          disabled={disabled}
          value={scoringMethod}
          onChange={(event) => {
            if (!isScoringMethod(event.target.value)) return;
            setScoringMethod(event.target.value);
            if (event.target.value !== ScoringMethod.REFEREE_COMMAND)
              setSupervisorScoring(false);
          }}
        >
          {scoringMethods.map((method) => (
            <option key={method} value={method}>
              {scoringMethodLabels[method]}
            </option>
          ))}
        </select>
      </label>
      <Switch
        checked={refereeCommand && supervisorScoring}
        description={
          refereeCommand
            ? "Giám sát chọn VĐV như một giám định khi tạm dừng để chấm điểm."
            : "Chỉ dùng được với hình thức chấm điểm theo hiệu lệnh trọng tài."
        }
        disabled={disabled || !refereeCommand}
        label="Ghi nhận điểm từ trọng tài/giám sát"
        onCheckedChange={setSupervisorScoring}
      />
      {evenScorers ? (
        <>
          <Alert tone="info">
            <p>Do số người chấm điểm là số chẵn nên cần xác định chính xác điều kiện cho điểm.</p>
            <p>
              Lưu ý: Số người chấm điểm là tổng số Giám định và Trọng tài nếu có.
            </p>
          </Alert>
          <label className={settingsLabelClassName}>
            Điều kiện tính điểm
            <select
              className={selectClassName}
              aria-describedby={`scoring-threshold-hint-${row.id}`}
              aria-invalid={thresholdMissing}
              aria-label={`${row.roundLabel}: điều kiện tính điểm`}
              aria-required
              disabled={disabled}
              ref={thresholdRef}
              value={scoringThreshold ?? ""}
              onChange={(event) => {
                if (!isScoringThreshold(event.target.value)) return;
                setScoringThreshold(event.target.value);
                setThresholdMissing(false);
              }}
            >
              <option disabled value="">
                Chọn điều kiện tính điểm
              </option>
              {scoringThresholds.map((threshold) => (
                <option key={threshold} value={threshold}>
                  {scoringThresholdLabels[threshold]}
                </option>
              ))}
            </select>
            <span
              className={`block font-normal ${settingsHintClassName}`}
              id={`scoring-threshold-hint-${row.id}`}
            >
              {scoringThresholdHint({
                judgeCount,
                supervisorScores: refereeCommand && supervisorScoring,
                threshold: scoringThreshold,
              })}
            </span>
          </label>
          {thresholdMissing ? (
            <Alert role="alert" tone="error">
              Vui lòng chọn Điều kiện tính điểm trước khi lưu cấu hình.
            </Alert>
          ) : null}
        </>
      ) : null}
      <div className="flex justify-end">
        <Button
          className={settingsButtonClassName}
          type="submit"
          disabled={disabled || !valid}
        >
          {locked ? "Đã khóa" : "Lưu cấu hình"}
        </Button>
      </div>
    </form>
  );
}
