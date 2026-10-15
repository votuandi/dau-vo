import { AthleteColor, FaultSeverity } from '@martial-arts-scoring/shared-types';

export function AthleteScoreCard({
  athlete,
}: {
  readonly athlete: {
    color: AthleteColor;
    name: string;
    organization: string | null;
    score: number;
    violations: number;
    faultCounts: { minor: number; major: number };
  };
}) {
  const isRed = athlete.color === AthleteColor.RED;
  const colorLabel = isRed ? 'RED' : 'BLUE';

  return (
    <section
      aria-label={`Võ sĩ ${colorLabel}`}
      className={`rounded-2xl border p-4 sm:p-5 ${
        isRed
          ? 'border-red-300/45 bg-gradient-to-br from-red-600/35 via-red-700/25 to-red-950/40 shadow-lg shadow-red-950/15'
          : 'border-sky-300/45 bg-gradient-to-br from-sky-600/30 via-blue-800/25 to-blue-950/40 shadow-lg shadow-blue-950/15'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-xs font-black tracking-[0.2em] ${isRed ? 'text-red-100' : 'text-sky-100'}`}
          >
            {colorLabel}
          </p>
          <p className="mt-2 line-clamp-2 break-words text-lg font-black leading-tight text-white sm:text-xl">
            {athlete.name}
          </p>
          <p
            className="mt-1 truncate text-sm text-sky-100/80"
            title={athlete.organization ?? undefined}
          >
            {athlete.organization}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-100/75">Điểm</p>
          <p className="mt-1 font-mono text-4xl font-black tabular-nums text-white">
            {athlete.score}
          </p>
        </div>
      </div>
      <p className="mt-4 border-t border-white/15 pt-3 text-sm font-semibold text-sky-50/90">
        Lỗi nhẹ: <span className="font-mono text-lg font-black">{athlete.faultCounts.minor}</span> ·
        Lỗi nặng: <span className="font-mono text-lg font-black">{athlete.faultCounts.major}</span>
      </p>
    </section>
  );
}

export function FaultButton({
  athlete,
  disabled,
  isArmed,
  isSubmitting,
  onPress,
  severity,
}: {
  readonly athlete: AthleteColor;
  readonly disabled: boolean;
  readonly isArmed: boolean;
  readonly isSubmitting: boolean;
  readonly onPress: (athlete: AthleteColor, severity: FaultSeverity) => void;
  readonly severity: FaultSeverity;
}) {
  const isRed = athlete === AthleteColor.RED;
  const colorLabel = isRed ? 'ĐỎ' : 'XANH';
  const baseClass = isRed
    ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30 hover:from-red-700 hover:via-red-800 hover:to-red-950 focus-visible:ring-red-300'
    : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30 hover:from-sky-800 hover:via-blue-900 hover:to-blue-950 focus-visible:ring-sky-300';
  const severityClass =
    severity === FaultSeverity.MAJOR
      ? isRed
        ? 'border-red-400 bg-gradient-to-br from-red-700 via-red-800 to-red-950 shadow-red-950/50 hover:from-red-800 hover:via-red-900 hover:to-red-950 focus-visible:ring-red-300'
        : 'border-blue-400 bg-gradient-to-br from-blue-800 via-blue-900 to-slate-950 shadow-blue-950/50 hover:from-blue-900 hover:via-blue-950 hover:to-slate-950 focus-visible:ring-blue-300'
      : '';

  return (
    <button
      aria-label={`Ghi nhận ${severity === FaultSeverity.MINOR ? 'Lỗi nhẹ' : 'Lỗi nặng'} VĐV ${colorLabel}`}
      aria-pressed={isArmed}
      className={`min-h-28 rounded-2xl border-4 px-4 py-5 text-center text-xl font-black text-white shadow-lg transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-32 sm:text-2xl ${baseClass} ${severityClass} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4`}
      disabled={disabled}
      onClick={() => {
        onPress(athlete, severity);
      }}
      type="button"
    >
      {isSubmitting
        ? 'ĐANG GHI…'
        : isArmed
          ? 'XÁC NHẬN'
          : severity === FaultSeverity.MINOR
            ? 'LỖI NHẸ'
            : 'LỖI NẶNG'}
    </button>
  );
}
