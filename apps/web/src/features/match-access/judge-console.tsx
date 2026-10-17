import { AthleteColor, MatchStatus } from '@martial-arts-scoring/shared-types';
import type { MatchRealtimeState, RealtimeConnectionStatus } from './match-realtime';
import { IntermissionCountdown, useIntermissionActive } from '@/components/intermission-countdown';
import { formatCountdown, useServerCountdown } from '@/features/match-timer/server-countdown';

interface JudgeConsoleProps {
  readonly realtime: MatchRealtimeState;
}

const connectionLabels: Record<RealtimeConnectionStatus, string> = {
  'authentication-required': 'Mất kết nối',
  connected: 'Đã kết nối',
  connecting: 'Đang kết nối lại',
  disconnected: 'Mất kết nối',
  error: 'Mất kết nối',
  reconnecting: 'Đang kết nối lại',
  revoked: 'Mất kết nối',
};

const connectionDotClasses: Record<RealtimeConnectionStatus, string> = {
  'authentication-required': 'bg-red-500',
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  disconnected: 'bg-red-500',
  error: 'bg-red-500',
  reconnecting: 'bg-amber-400',
  revoked: 'bg-red-500',
};

function displayPhase(status: MatchStatus | undefined): string {
  switch (status) {
    case MatchStatus.ROUND_1_RUNNING:
      return 'Hiệp 1';
    case MatchStatus.ROUND_1_PAUSED:
      return 'Hiệp 1 · TẠM DỪNG';
    case MatchStatus.ROUND_2_RUNNING:
      return 'Hiệp 2';
    case MatchStatus.ROUND_2_PAUSED:
      return 'Hiệp 2 · TẠM DỪNG';
    case MatchStatus.BREAK:
      return 'Nghỉ giữa hiệp';
    case MatchStatus.AWAITING_RESULT_SAVE:
      return 'Chờ lưu kết quả';
    case MatchStatus.FINISHED:
      return 'Kết thúc';
    case MatchStatus.WAITING:
      return 'Chờ bắt đầu';
    default:
      return 'Đang đồng bộ';
  }
}

function AthleteVoteButton({
  accepted,
  athlete,
  disabled,
  isSubmitting,
  name,
  onVote,
}: {
  readonly accepted: boolean;
  readonly athlete: AthleteColor;
  readonly disabled: boolean;
  readonly isSubmitting: boolean;
  readonly name: string;
  readonly onVote: (athlete: AthleteColor) => void;
}) {
  const isRed = athlete === AthleteColor.RED;
  const colorLabel = isRed ? 'RED' : 'BLUE';

  return (
    <button
      aria-label={`Chấm điểm ${colorLabel} cho ${name}`}
      aria-pressed={isSubmitting}
      className={`group relative flex min-h-44 touch-manipulation select-none flex-col overflow-hidden rounded-3xl border-4 text-white shadow-lg transition duration-100 active:scale-[0.97] disabled:cursor-not-allowed sm:min-h-64 short:min-h-32 ${
        isRed
          ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30 hover:from-red-700 hover:via-red-800 hover:to-red-950 focus-visible:ring-red-300'
          : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30 hover:from-sky-800 hover:via-blue-900 hover:to-blue-950 focus-visible:ring-sky-300'
      } ${
        accepted || isSubmitting
          ? 'ring-4 ring-emerald-300 ring-offset-2 ring-offset-transparent'
          : 'disabled:opacity-40'
      } focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4`}
      disabled={disabled}
      onClick={() => {
        onVote(athlete);
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20"
      />
      <span className="relative flex flex-1 flex-col items-center justify-center gap-2 p-3 text-center sm:p-6">
        <span className="block text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl short:text-4xl">
          {colorLabel}
        </span>
        <span className="line-clamp-2 break-words text-base font-bold leading-tight text-white/90 sm:text-2xl short:text-sm">
          {name}
        </span>
      </span>
      <span className="relative border-t border-white/15 bg-black/15 px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-white/90 sm:text-sm">
        {accepted ? '✓ Đã ghi nhận' : isSubmitting ? 'Đang gửi…' : 'Chạm để chọn'}
      </span>
    </button>
  );
}

export function JudgeConsole({ realtime }: JudgeConsoleProps) {
  const snapshot = realtime.snapshot;
  const status = snapshot?.match.phase;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const roundIsPaused =
    status === MatchStatus.ROUND_1_PAUSED || status === MatchStatus.ROUND_2_PAUSED;
  const remainingTime = useServerCountdown(
    roundIsRunning ? snapshot?.activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const displayedRemaining = roundIsPaused
    ? (snapshot?.activeRound?.remainingDurationMs ?? null)
    : remainingTime;
  const intermission = useIntermissionActive(
    status === MatchStatus.BREAK ? snapshot?.match.intermissionEndsAt : null,
    snapshot?.generatedAt,
  );
  const appealActive =
    status === MatchStatus.REGULATION_APPEAL || status === MatchStatus.OVERTIME_APPEAL;
  const yellowPresentation = roundIsPaused || intermission.active || appealActive;
  const redAthlete = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blueAthlete = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);
  const controlsDisabled =
    realtime.connectionStatus !== 'connected' ||
    !roundIsRunning ||
    realtime.submittingVote !== null ||
    realtime.lastAcceptedVote !== null;
  const pendingVote = realtime.submittingVote;
  const acceptedVote = realtime.lastAcceptedVote;

  function vote(athlete: AthleteColor): void {
    // A short buzz confirms the tap without the judge looking at the screen.
    if ('vibrate' in navigator) navigator.vibrate(30);
    void realtime.submitVote(athlete);
  }

  return (
    <div
      className={`min-h-dvh text-white ${yellowPresentation ? 'bg-gradient-to-br from-amber-950 via-yellow-800 to-amber-950' : 'arena-background'}`}
    >
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:gap-5 sm:px-5 sm:py-5 short:gap-2 short:py-2">
        <header
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 shadow-xl shadow-black/10 backdrop-blur-xl sm:px-5 sm:py-3 ${yellowPresentation ? 'border-amber-200/40 bg-amber-950/45' : 'border-white/15 bg-blue-950/35'}`}
        >
          <div className="flex min-w-0 items-baseline gap-2 sm:block">
            <p className="shrink-0 text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">
              Giám định
            </p>
            <p className="truncate font-mono text-base font-black tracking-[0.14em] text-white sm:mt-1 sm:text-xl">
              {snapshot?.match.publicId ?? 'Đang đồng bộ'}
            </p>
          </div>
          <div
            aria-live="polite"
            className="flex shrink-0 items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold sm:text-sm"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${connectionDotClasses[realtime.connectionStatus]}`}
            />
            {connectionLabels[realtime.connectionStatus]}
          </div>
        </header>

        <section
          aria-labelledby="referee-round-title"
          className={`flex flex-col justify-center rounded-3xl border px-4 py-4 text-center shadow-2xl backdrop-blur-xl sm:px-8 sm:py-8 short:py-2 ${yellowPresentation ? 'border-amber-200/40 bg-amber-950/30 shadow-amber-950/30' : 'border-white/15 bg-white/10 shadow-blue-950/20'}`}
        >
          <p
            className="text-sm font-black uppercase tracking-[0.2em] text-sky-200"
            id="referee-round-title"
          >
            {displayPhase(status)}
          </p>
          <p
            aria-label={`Thời gian còn lại ${formatCountdown(displayedRemaining ?? 0)}`}
            className="mt-1 font-mono text-6xl font-black tabular-nums tracking-tight sm:mt-2 sm:text-8xl lg:text-9xl short:text-5xl"
            role="timer"
          >
            {(roundIsRunning || roundIsPaused) && displayedRemaining !== null
              ? formatCountdown(displayedRemaining)
              : '--:--'}
          </p>
          <p className="mt-2 text-xs text-sky-100/75 sm:mt-3 sm:text-sm short:hidden">
            {roundIsPaused
              ? 'Hiệp đấu đang tạm dừng. Không thể chấm điểm.'
              : roundIsRunning
                ? 'Thời gian chính thức do máy chủ xác định'
                : status === MatchStatus.FINISHED
                  ? 'Trận đấu đã kết thúc'
                  : 'Chờ trạng thái chính thức từ máy chủ'}
          </p>
          <IntermissionCountdown
            endsAt={status === MatchStatus.BREAK ? snapshot?.match.intermissionEndsAt : null}
            generatedAt={snapshot?.generatedAt}
          />
        </section>

        <section aria-label="Lựa chọn chấm điểm" className="grid flex-1 grid-cols-2 gap-3 sm:gap-5">
          <AthleteVoteButton
            accepted={acceptedVote?.athlete === AthleteColor.RED}
            athlete={AthleteColor.RED}
            disabled={controlsDisabled}
            isSubmitting={pendingVote === AthleteColor.RED}
            name={redAthlete?.name ?? 'Võ sĩ Đỏ'}
            onVote={vote}
          />
          <AthleteVoteButton
            accepted={acceptedVote?.athlete === AthleteColor.BLUE}
            athlete={AthleteColor.BLUE}
            disabled={controlsDisabled}
            isSubmitting={pendingVote === AthleteColor.BLUE}
            name={blueAthlete?.name ?? 'Võ sĩ Xanh'}
            onVote={vote}
          />
        </section>

        <section aria-live="polite" className="min-h-12 text-center text-sm">
          {acceptedVote ? (
            <p
              className="rounded-xl bg-emerald-400/15 px-4 py-3 font-semibold text-emerald-200"
              role="status"
            >
              Máy chủ đã ghi nhận lựa chọn{' '}
              {acceptedVote.athlete === AthleteColor.RED ? 'RED' : 'BLUE'}. Chờ cửa sổ chấm điểm kết
              thúc.
            </p>
          ) : pendingVote ? (
            <p
              className="rounded-xl bg-amber-400/15 px-4 py-3 font-semibold text-amber-100"
              role="status"
            >
              Đã gửi lựa chọn {pendingVote === AthleteColor.RED ? 'RED' : 'BLUE'}; đang chờ máy chủ
              xác nhận.
            </p>
          ) : realtime.voteSubmitErrorMessage ? (
            <p
              className="rounded-xl bg-red-400/15 px-4 py-3 font-semibold text-red-100"
              role="alert"
            >
              {realtime.voteSubmitErrorMessage}
            </p>
          ) : realtime.connectionStatus !== 'connected' ? (
            <p className="px-4 py-3 text-sky-100/70">Không thể gửi lựa chọn khi mất kết nối.</p>
          ) : !roundIsRunning ? (
            <p className="px-4 py-3 text-sky-100/70">Lựa chọn chỉ mở khi hiệp đấu đang diễn ra.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
