import { AthleteColor, FaultSeverity } from '@martial-arts-scoring/shared-types';

export const athleteActionButtonClassName =
  'flex h-16 min-h-16 w-full min-w-0 items-center justify-center whitespace-normal rounded-xl border-2 px-1 py-2 text-center text-xs font-black leading-tight text-white sm:h-20 sm:min-h-20 sm:px-2 sm:text-sm';

export function AthleteScoreCard({
  athlete,
  onSelect,
  selected = false,
  submitting = false,
}: {
  readonly athlete: {
    color: AthleteColor;
    name: string;
    organization: string | null;
    score: number;
    violations: number;
    faultCounts: { minor: number; major: number };
  };
  /**
   * Set while the supervisor can score as "TT": the card becomes the choice for this
   * athlete. Absent otherwise, so the card stays a plain read-out.
   */
  readonly onSelect?: (() => void) | undefined;
  readonly selected?: boolean;
  readonly submitting?: boolean;
}) {
  const isRed = athlete.color === AthleteColor.RED;
  const colorLabel = isRed ? 'RED' : 'BLUE';
  const selectable = onSelect !== undefined;

  const content = (
    <>
      {/* Same sheen as the judge console's athlete buttons. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20"
      />
      <div className="relative flex items-start justify-between gap-2">
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
      <p className="relative mt-2 min-h-[2.5em] line-clamp-2 break-words text-base font-black leading-tight text-white sm:text-xl">
        {athlete.name}
      </p>
      <p
        className="relative mt-1 min-h-[1.5em] truncate text-xs text-white/85 sm:text-sm"
        title={athlete.organization ?? undefined}
      >
        {athlete.organization}
      </p>
      {selectable ? (
        <p
          className={`relative mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black ${
            selected ? 'bg-white text-slate-900' : 'bg-white/15 text-white'
          }`}
        >
          {submitting ? 'Đang ghi nhận…' : selected ? '✓ TT đã chọn' : 'Chạm để chọn (TT)'}
        </p>
      ) : null}
      <p className="relative mt-auto flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-white/15 pt-2 text-xs font-semibold text-white/90 sm:text-sm">
        <span>
          Lỗi nhẹ:{' '}
          <span className="font-mono text-base font-black">{athlete.faultCounts.minor}</span>
        </span>
        <span>
          Lỗi nặng:{' '}
          <span className="font-mono text-base font-black">{athlete.faultCounts.major}</span>
        </span>
      </p>
    </>
  );
  // Solid corner colours, matching the judge console's athlete buttons.
  const surface = `relative flex h-full flex-col overflow-hidden rounded-3xl border-4 p-3 text-left text-white shadow-lg sm:p-5 ${
    isRed
      ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30'
      : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30'
  }`;

  if (!selectable) {
    return (
      <section aria-label={`Võ sĩ ${colorLabel}`} className={surface}>
        {content}
      </section>
    );
  }
  return (
    <button
      aria-label={`TT chọn ${isRed ? 'ĐỎ' : 'XANH'} — ${athlete.name}`}
      aria-pressed={selected}
      className={`${surface} w-full touch-manipulation select-none transition duration-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4 disabled:cursor-wait ${
        isRed
          ? 'hover:from-red-700 hover:via-red-800 hover:to-red-950 focus-visible:ring-red-300'
          : 'hover:from-sky-800 hover:via-blue-900 hover:to-blue-950 focus-visible:ring-sky-300'
      } ${selected ? 'ring-4 ring-emerald-300 ring-offset-2 ring-offset-transparent' : ''}`}
      disabled={submitting}
      onClick={onSelect}
      type="button"
    >
      {content}
    </button>
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
