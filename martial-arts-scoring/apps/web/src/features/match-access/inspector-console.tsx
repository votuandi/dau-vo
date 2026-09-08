import { useEffect, useRef, useState } from 'react';
import { AthleteColor, MatchStatus } from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import type { MatchRealtimeState, RealtimeConnectionStatus } from './match-realtime';
import type { MatchAccessSession } from '@/services/api/match-access';

interface InspectorConsoleProps {
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
    case MatchStatus.WAITING:
      return 'CHỜ BẮT ĐẦU';
    case MatchStatus.ROUND_1_RUNNING:
      return 'HIỆP 1';
    case MatchStatus.BREAK:
      return 'GIẢI LAO';
    case MatchStatus.ROUND_2_RUNNING:
      return 'HIỆP 2';
    case MatchStatus.FINISHED:
      return 'TRẬN ĐẤU ĐÃ KẾT THÚC';
    default:
      return 'ĐANG ĐỒNG BỘ';
  }
}

function formatRemainingTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * This is a display-only timer. Server snapshots supply both timestamps; the
 * browser never uses it to transition state or decide command validity.
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

  const endMilliseconds = new Date(endsAt).getTime();
  return Number.isNaN(endMilliseconds)
    ? null
    : Math.max(0, endMilliseconds - (browserNow + serverOffsetRef.current));
}

function AthleteScoreCard({
  athlete,
}: {
  readonly athlete: {
    color: AthleteColor;
    name: string;
    organization: string;
    score: number;
    violations: number;
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
          <p className="mt-2 truncate text-lg font-black text-white sm:text-xl">{athlete.name}</p>
          <p className="mt-1 truncate text-sm text-sky-100/80">{athlete.organization}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-100/75">Điểm</p>
          <p className="mt-1 font-mono text-4xl font-black tabular-nums text-white">
            {athlete.score}
          </p>
        </div>
      </div>
      <p className="mt-4 border-t border-white/15 pt-3 text-sm font-semibold text-sky-50/90">
        Lỗi vi phạm: <span className="font-mono text-lg font-black">{athlete.violations}</span>
      </p>
    </section>
  );
}

function PenaltyButton({
  athlete,
  disabled,
  isArmed,
  isSubmitting,
  onPress,
}: {
  readonly athlete: AthleteColor;
  readonly disabled: boolean;
  readonly isArmed: boolean;
  readonly isSubmitting: boolean;
  readonly onPress: (athlete: AthleteColor) => void;
}) {
  const isRed = athlete === AthleteColor.RED;
  const colorLabel = isRed ? 'ĐỎ' : 'XANH';
  const baseClass = isRed
    ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30 hover:from-red-700 hover:via-red-800 hover:to-red-950 focus-visible:ring-red-300'
    : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30 hover:from-sky-800 hover:via-blue-900 hover:to-blue-950 focus-visible:ring-sky-300';

  return (
    <button
      aria-label={`Ghi lỗi ${colorLabel}`}
      aria-pressed={isArmed}
      className={`min-h-28 rounded-2xl border-4 px-4 py-5 text-center text-xl font-black text-white shadow-lg transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-32 sm:text-2xl ${baseClass} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4`}
      disabled={disabled}
      onClick={() => {
        onPress(athlete);
      }}
      type="button"
    >
      {isSubmitting ? 'ĐANG GHI…' : isArmed ? `XÁC NHẬN LỖI ${colorLabel}` : `LỖI ${colorLabel}`}
    </button>
  );
}

export function InspectorConsole({
  isLogoutPending,
  onLogout,
  realtime,
  session,
}: InspectorConsoleProps) {
  const snapshot = realtime.snapshot;
  const status = snapshot?.match.status;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const remainingTime = useServerDisplayTimer(
    roundIsRunning ? snapshot?.activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const [armedPenalty, setArmedPenalty] = useState<AthleteColor | null>(null);
  const penaltyControlsDisabled =
    realtime.connectionStatus !== 'connected' ||
    !roundIsRunning ||
    realtime.submittingPenalty !== null;
  const canStartRound = status === MatchStatus.WAITING || status === MatchStatus.BREAK;
  const startLabel = status === MatchStatus.BREAK ? 'BẮT ĐẦU HIỆP 2' : 'BẮT ĐẦU HIỆP 1';
  const redAthlete = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blueAthlete = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);

  useEffect(() => {
    if (armedPenalty === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setArmedPenalty(null);
    }, 1_800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [armedPenalty]);

  useEffect(() => {
    if (!roundIsRunning) {
      setArmedPenalty(null);
    }
  }, [roundIsRunning]);

  function handlePenaltyPress(athlete: AthleteColor): void {
    if (penaltyControlsDisabled) {
      return;
    }

    if (armedPenalty !== athlete) {
      setArmedPenalty(athlete);
      return;
    }

    setArmedPenalty(null);
    void realtime.submitPenalty(athlete);
  }

  return (
    <div className="arena-background min-h-dvh text-white">
      <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-5 sm:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-blue-950/35 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur-xl sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">
              Giám định
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
              className="border-white/20 bg-transparent text-white hover:border-white/30 hover:bg-white/10 hover:text-white"
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

        <section className="mt-3 rounded-3xl border border-white/15 bg-white/10 px-5 py-7 text-center shadow-2xl shadow-blue-950/20 backdrop-blur-xl sm:mt-5 sm:px-8 sm:py-9">
          <p className="text-sm font-black tracking-[0.2em] text-sky-200">
            {displayPhase(status)}
          </p>
          <p
            aria-label={`Thời gian còn lại ${formatRemainingTime(remainingTime ?? 0)}`}
            className="mt-2 font-mono text-6xl font-black tabular-nums tracking-tight sm:text-8xl"
            role="timer"
          >
            {roundIsRunning && remainingTime !== null
              ? formatRemainingTime(remainingTime)
              : '--:--'}
          </p>
          <p className="mt-3 text-sm text-sky-100/75">
            {roundIsRunning
              ? 'Thời gian chính thức do máy chủ xác định'
              : status === MatchStatus.BREAK
                ? 'Chờ giám định viên bắt đầu Hiệp 2'
                : status === MatchStatus.FINISHED
                  ? 'Trận đấu đã kết thúc'
                  : 'Chờ trạng thái chính thức từ máy chủ'}
          </p>

          {canStartRound ? (
            <Button
              className="mt-6 h-16 w-full max-w-md text-lg font-black"
              disabled={realtime.connectionStatus !== 'connected' || realtime.startingRound}
              onClick={() => void realtime.startRound()}
              type="button"
            >
              {realtime.startingRound ? 'ĐANG BẮT ĐẦU…' : startLabel}
            </Button>
          ) : null}

          {realtime.roundStartErrorMessage ? (
            <p
              className="mx-auto mt-5 max-w-xl rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100"
              role="alert"
            >
              {realtime.roundStartErrorMessage}
            </p>
          ) : null}
        </section>

        <section
          aria-label="Bảng điểm trận đấu"
          className="mt-3 grid gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-5"
        >
          <AthleteScoreCard
            athlete={
              redAthlete ?? {
                color: AthleteColor.RED,
                name: 'Võ sĩ Đỏ',
                organization: 'Đang tải…',
                score: 0,
                violations: 0,
              }
            }
          />
          <AthleteScoreCard
            athlete={
              blueAthlete ?? {
                color: AthleteColor.BLUE,
                name: 'Võ sĩ Xanh',
                organization: 'Đang tải…',
                score: 0,
                violations: 0,
              }
            }
          />
        </section>

        <section
          aria-labelledby="inspector-penalty-title"
          className="mt-3 rounded-3xl border border-white/15 bg-white/10 p-4 shadow-xl shadow-blue-950/15 backdrop-blur-xl sm:mt-5 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="text-lg font-black" id="inspector-penalty-title">
                Ghi nhận lỗi
              </h1>
              <p className="mt-1 text-sm text-sky-100/75">
                Nhấn hai lần cùng một nút trong 1,8 giây để xác nhận, giúp tránh chạm nhầm.
              </p>
            </div>
            <p className="text-sm font-semibold text-sky-100/85">
              Hiệp: {snapshot?.match.currentRound ?? 'Chưa bắt đầu'}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5">
            <PenaltyButton
              athlete={AthleteColor.RED}
              disabled={penaltyControlsDisabled}
              isArmed={armedPenalty === AthleteColor.RED}
              isSubmitting={realtime.submittingPenalty === AthleteColor.RED}
              onPress={handlePenaltyPress}
            />
            <PenaltyButton
              athlete={AthleteColor.BLUE}
              disabled={penaltyControlsDisabled}
              isArmed={armedPenalty === AthleteColor.BLUE}
              isSubmitting={realtime.submittingPenalty === AthleteColor.BLUE}
              onPress={handlePenaltyPress}
            />
          </div>

          <div aria-live="polite" className="mt-4 min-h-6 text-sm">
            {armedPenalty ? (
              <p className="font-semibold text-amber-200">
                Nhấn LỖI {armedPenalty === AthleteColor.RED ? 'ĐỎ' : 'XANH'} lần nữa để xác nhận.
              </p>
            ) : realtime.penaltyErrorMessage ? (
              <p
                className="rounded-xl bg-red-400/15 px-4 py-3 font-semibold text-red-100"
                role="alert"
              >
                {realtime.penaltyErrorMessage}
              </p>
            ) : !roundIsRunning ? (
              <p className="text-sky-100/70">
                Chỉ có thể ghi lỗi khi Hiệp 1 hoặc Hiệp 2 đang diễn ra.
              </p>
            ) : realtime.connectionStatus !== 'connected' ? (
              <p className="text-sky-100/70">Không thể ghi lỗi khi mất kết nối.</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
