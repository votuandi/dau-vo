import { AthleteColor, FaultSeverity } from '@martial-arts-scoring/shared-types';

export const athleteActionButtonClassName =
  'flex h-16 min-h-16 w-full min-w-0 items-center justify-center whitespace-normal rounded-xl border-2 px-1 py-2 text-center text-xs font-black leading-tight text-white sm:h-20 sm:min-h-20 sm:px-2 sm:text-sm';

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
      className={`flex h-full flex-col rounded-2xl border p-3 sm:p-5 ${
        isRed
          ? 'border-red-300/45 bg-gradient-to-br from-red-600/35 via-red-700/25 to-red-950/40 shadow-lg shadow-red-950/15'
          : 'border-sky-300/45 bg-gradient-to-br from-sky-600/30 via-blue-800/25 to-blue-950/40 shadow-lg shadow-blue-950/15'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-xs font-black tracking-[0.2em] ${isRed ? 'text-red-100' : 'text-sky-100'}`}
        >
          {colorLabel}
        </p>
        <p className="-mt-1 font-mono text-4xl font-black leading-none tabular-nums text-white sm:text-5xl">
          <span className="sr-only">Điểm </span>
          {athlete.score}
        </p>
      </div>
      <p className="mt-2 min-h-[2.5em] line-clamp-2 break-words text-base font-black leading-tight text-white sm:text-xl">
        {athlete.name}
      </p>
      <p
        className="mt-1 min-h-[1.5em] truncate text-xs text-sky-100/80 sm:text-sm"
        title={athlete.organization ?? undefined}
      >
        {athlete.organization}
      </p>
      <p className="mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-white/15 pt-2 text-xs font-semibold text-sky-50/90 sm:text-sm">
        <span>
          Lỗi nhẹ:{' '}
          <span className="font-mono text-base font-black">{athlete.faultCounts.minor}</span>
        </span>
        <span>
          Lỗi nặng:{' '}
          <span className="font-mono text-base font-black">{athlete.faultCounts.major}</span>
        </span>
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
  const severityClass =
    severity === FaultSeverity.MAJOR
      ? isRed
        ? 'border-red-400/70 from-red-800 via-red-900 to-red-950 shadow-red-950/50 hover:from-red-900 hover:via-red-950 hover:to-red-950 focus-visible:ring-red-300'
        : 'border-blue-400/70 from-blue-800 via-blue-900 to-slate-950 shadow-blue-950/50 hover:from-blue-900 hover:via-blue-950 hover:to-slate-950 focus-visible:ring-blue-300'
      : isRed
        ? 'border-red-300/80 from-red-600 via-red-600 to-red-700 shadow-red-950/25 hover:from-red-700 hover:via-red-700 hover:to-red-800 focus-visible:ring-red-300'
        : 'border-sky-300/80 from-sky-700 via-blue-600 to-blue-700 shadow-blue-950/25 hover:from-sky-800 hover:via-blue-700 hover:to-blue-800 focus-visible:ring-sky-300';

  return (
    <button
      aria-label={`Ghi nhận ${severity === FaultSeverity.MINOR ? 'Lỗi nhẹ' : 'Lỗi nặng'} VĐV ${colorLabel}`}
      aria-pressed={isArmed}
      className={`${athleteActionButtonClassName} touch-manipulation select-none shadow-lg transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 bg-gradient-to-br ${severityClass} ${isArmed ? 'animate-pulse ring-4 ring-amber-300' : ''} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4`}
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
