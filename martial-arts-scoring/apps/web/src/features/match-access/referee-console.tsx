import { useEffect, useRef, useState } from 'react';
import { AthleteColor, MatchStatus, RefereeSlot } from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import type { MatchRealtimeState, RealtimeConnectionStatus } from './match-realtime';
import type { MatchAccessSession } from '@/services/api/match-access';

interface RefereeConsoleProps {
  readonly isLogoutPending: boolean;
  readonly onLogout: () => void;
  readonly realtime: MatchRealtimeState;
  readonly session: MatchAccessSession;
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
  'authentication-required': 'bg-rose-500',
  connected: 'bg-emerald-400',
  connecting: 'bg-amber-400',
  disconnected: 'bg-rose-500',
  error: 'bg-rose-500',
  reconnecting: 'bg-amber-400',
  revoked: 'bg-rose-500',
};

function refereeIdentity(session: MatchAccessSession): string {
  switch (session.refereeSlot) {
    case RefereeSlot.REFEREE_1:
      return 'Trọng tài 1';
    case RefereeSlot.REFEREE_2:
      return 'Trọng tài 2';
    case RefereeSlot.REFEREE_3:
      return 'Trọng tài 3';
    default:
      return 'Trọng tài';
  }
}

function displayPhase(status: MatchStatus | undefined): string {
  switch (status) {
    case MatchStatus.ROUND_1_RUNNING:
      return 'Hiệp 1';
    case MatchStatus.ROUND_2_RUNNING:
      return 'Hiệp 2';
    case MatchStatus.BREAK:
      return 'Nghỉ giữa hiệp';
    case MatchStatus.FINISHED:
      return 'Kết thúc';
    case MatchStatus.WAITING:
      return 'Chờ bắt đầu';
    default:
      return 'Đang đồng bộ';
  }
}

function formatRemainingTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * This countdown is display-only. It derives its offset and end timestamp from
 * the server snapshot; it never decides whether a vote is valid.
 */
function useServerDisplayTimer(
  endsAt: string | undefined,
  generatedAt: string | undefined,
): number | null {
  const [browserNow, setBrowserNow] = useState(() => Date.now());
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    const localNow = Date.now();
    const serverNow = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    serverOffsetRef.current = Number.isNaN(serverNow) ? 0 : serverNow - localNow;
    setBrowserNow(localNow);

    if (!endsAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setBrowserNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, generatedAt]);

  if (!endsAt) {
    return null;
  }

  const endsAtMilliseconds = new Date(endsAt).getTime();
  return Number.isNaN(endsAtMilliseconds)
    ? null
    : Math.max(0, endsAtMilliseconds - (browserNow + serverOffsetRef.current));
}

function AthleteVoteButton({
  athlete,
  disabled,
  isSubmitting,
  name,
  onVote,
}: {
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
      className={`group relative min-h-52 overflow-hidden rounded-3xl border-4 text-left text-white shadow-lg transition duration-100 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-64 lg:min-h-[min(38vh,25rem)] ${
        isRed
          ? 'border-red-300 bg-red-700 hover:bg-red-800 focus-visible:ring-red-300'
          : 'border-blue-300 bg-blue-700 hover:bg-blue-800 focus-visible:ring-blue-300'
      } focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4`}
      disabled={disabled}
      onClick={() => {
        onVote(athlete);
      }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20"
      />
      <span className="relative flex h-full min-h-52 flex-col justify-between p-5 sm:min-h-64 sm:p-7 lg:min-h-[min(38vh,25rem)]">
        <span className="text-sm font-black tracking-[0.2em] text-white/80">{colorLabel}</span>
        <span>
          <span className="block text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            {colorLabel}
          </span>
          <span className="mt-2 block truncate text-base font-semibold text-white/90 sm:text-xl">
            {name}
          </span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-white/75">
          {isSubmitting ? 'Đang gửi lựa chọn…' : 'Chạm để chọn'}
        </span>
      </span>
    </button>
  );
}

export function RefereeConsole({
  isLogoutPending,
  onLogout,
  realtime,
  session,
}: RefereeConsoleProps) {
  const snapshot = realtime.snapshot;
  const status = snapshot?.match.status;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const remainingTime = useServerDisplayTimer(
    roundIsRunning ? snapshot?.activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const redAthlete = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blueAthlete = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);
  const controlsDisabled =
    realtime.connectionStatus !== 'connected' ||
    !roundIsRunning ||
    realtime.submittingVote !== null ||
    realtime.lastAcceptedVote !== null;
  const pendingVote = realtime.submittingVote;
  const acceptedVote = realtime.lastAcceptedVote;

  return (
    <div className="min-h-dvh bg-slate-950 text-white">
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-3 py-3 sm:px-5 sm:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              {refereeIdentity(session)}
            </p>
            <p className="mt-1 truncate font-mono text-lg font-black tracking-[0.14em] text-white sm:text-xl">
              {session.matchPublicId}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div aria-live="polite" className="flex items-center gap-2 text-sm font-semibold">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${connectionDotClasses[realtime.connectionStatus]}`}
              />
              {connectionLabels[realtime.connectionStatus]}
            </div>
            <Button
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              disabled={isLogoutPending}
              onClick={onLogout}
              size="sm"
              type="button"
              variant="outline"
            >
              {isLogoutPending ? 'Đang thoát…' : 'Thoát'}
            </Button>
          </div>
        </header>

        <section
          aria-labelledby="referee-round-title"
          className="mt-3 flex flex-1 flex-col justify-center rounded-3xl border border-white/10 bg-slate-900 px-5 py-7 text-center sm:mt-5 sm:px-8 sm:py-10"
        >
          <p
            className="text-sm font-black uppercase tracking-[0.2em] text-slate-400"
            id="referee-round-title"
          >
            {displayPhase(status)}
          </p>
          <p
            aria-label={`Thời gian còn lại ${formatRemainingTime(remainingTime ?? 0)}`}
            className="mt-2 font-mono text-7xl font-black tabular-nums tracking-tight sm:text-8xl lg:text-9xl"
            role="timer"
          >
            {roundIsRunning && remainingTime !== null
              ? formatRemainingTime(remainingTime)
              : '--:--'}
          </p>
          <p className="mt-3 text-sm text-slate-400">
            {roundIsRunning
              ? 'Thời gian chính thức do máy chủ xác định'
              : status === MatchStatus.FINISHED
                ? 'Trận đấu đã kết thúc'
                : 'Chờ trạng thái chính thức từ máy chủ'}
          </p>
        </section>

        <section
          aria-label="Lựa chọn chấm điểm"
          className="mt-3 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-5"
        >
          <AthleteVoteButton
            athlete={AthleteColor.RED}
            disabled={controlsDisabled}
            isSubmitting={pendingVote === AthleteColor.RED}
            name={redAthlete?.name ?? 'Võ sĩ Đỏ'}
            onVote={(athlete) => void realtime.submitVote(athlete)}
          />
          <AthleteVoteButton
            athlete={AthleteColor.BLUE}
            disabled={controlsDisabled}
            isSubmitting={pendingVote === AthleteColor.BLUE}
            name={blueAthlete?.name ?? 'Võ sĩ Xanh'}
            onVote={(athlete) => void realtime.submitVote(athlete)}
          />
        </section>

        <section aria-live="polite" className="mt-3 min-h-12 text-center text-sm sm:mt-4">
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
              className="rounded-xl bg-rose-400/15 px-4 py-3 font-semibold text-rose-100"
              role="alert"
            >
              {realtime.voteSubmitErrorMessage}
            </p>
          ) : realtime.connectionStatus !== 'connected' ? (
            <p className="px-4 py-3 text-slate-400">Không thể gửi lựa chọn khi mất kết nối.</p>
          ) : !roundIsRunning ? (
            <p className="px-4 py-3 text-slate-400">Lựa chọn chỉ mở khi hiệp đấu đang diễn ra.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
