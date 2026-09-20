import { useEffect, useRef, useState } from 'react';
import { AthleteColor, MatchStatus } from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  getParticipantsNotReadyMessage,
  type MatchRealtimeState,
  type RealtimeConnectionStatus,
} from './match-realtime';
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
    case MatchStatus.ROUND_1_PAUSED:
      return 'HIỆP 1 · TẠM DỪNG';
    case MatchStatus.BREAK:
      return 'GIẢI LAO';
    case MatchStatus.ROUND_2_RUNNING:
      return 'HIỆP 2';
    case MatchStatus.ROUND_2_PAUSED:
      return 'HIỆP 2 · TẠM DỪNG';
    case MatchStatus.AWAITING_RESULT_SAVE:
      return 'CHỜ LƯU KẾT QUẢ';
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
    organization: string | null;
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
  const status = snapshot?.match.phase;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const roundIsPaused =
    status === MatchStatus.ROUND_1_PAUSED || status === MatchStatus.ROUND_2_PAUSED;
  const remainingTime = useServerDisplayTimer(
    roundIsRunning ? snapshot?.activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const [armedPenalty, setArmedPenalty] = useState<AthleteColor | null>(null);
  const [confirmation, setConfirmation] = useState<
    'pause' | 'resume' | 'cancel-round' | 'reset-match' | null
  >(null);
  const displayedRemaining = roundIsPaused
    ? (snapshot?.activeRound?.remainingDurationMs ?? null)
    : remainingTime;
  const penaltyControlsDisabled =
    realtime.connectionStatus !== 'connected' ||
    !roundIsRunning ||
    realtime.submittingPenalty !== null;
  const canStartRound = status === MatchStatus.WAITING || status === MatchStatus.BREAK;
  const refereeReadiness =
    snapshot?.readiness.kind === 'TOURNAMENT_OFFICIALS'
      ? snapshot.readiness.referees.map((referee) => ({
          connected: referee.connected,
          label: `Trọng tài ${String(referee.position)}`,
        }))
      : [
          {
            connected:
              snapshot?.readiness.kind === 'LEGACY_MATCH_ACCESS'
                ? snapshot.readiness.referees.REFEREE_1
                : false,
            label: 'Trọng tài 1',
          },
          {
            connected:
              snapshot?.readiness.kind === 'LEGACY_MATCH_ACCESS'
                ? snapshot.readiness.referees.REFEREE_2
                : false,
            label: 'Trọng tài 2',
          },
          {
            connected:
              snapshot?.readiness.kind === 'LEGACY_MATCH_ACCESS'
                ? snapshot.readiness.referees.REFEREE_3
                : false,
            label: 'Trọng tài 3',
          },
        ];
  const scoreboardConnectedCount = snapshot?.readiness.scoreboardConnectedCount ?? 0;
  const participantsReady = snapshot?.readiness.canStartRound ?? false;
  const readinessMessage =
    snapshot?.readiness.kind === 'TOURNAMENT_OFFICIALS'
      ? getParticipantsNotReadyMessage({
          assignedRefereeCount: snapshot.readiness.assignedRefereeCount,
          connectedRefereeCount: snapshot.readiness.connectedRefereeCount,
          inspectorConnected: snapshot.readiness.inspector.connected,
          requiredRefereeCount: snapshot.readiness.requiredRefereeCount,
          scoreboardConnectedCount: snapshot.readiness.scoreboardConnectedCount,
        })
      : snapshot?.readiness.kind === 'LEGACY_MATCH_ACCESS'
        ? getParticipantsNotReadyMessage({
            assignedRefereeCount: snapshot.readiness.requiredRefereeCount,
            connectedRefereeCount: Object.values(snapshot.readiness.referees).filter(Boolean)
              .length,
            inspectorConnected: true,
            requiredRefereeCount: snapshot.readiness.requiredRefereeCount,
            scoreboardConnectedCount: snapshot.readiness.scoreboardConnectedCount,
          })
        : getParticipantsNotReadyMessage(undefined);
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
          <p className="text-sm font-black tracking-[0.2em] text-sky-200">{displayPhase(status)}</p>
          <p
            aria-label={`Thời gian còn lại ${formatRemainingTime(displayedRemaining ?? 0)}`}
            className="mt-2 font-mono text-6xl font-black tabular-nums tracking-tight sm:text-8xl"
            role="timer"
          >
            {(roundIsRunning || roundIsPaused) && displayedRemaining !== null
              ? formatRemainingTime(displayedRemaining)
              : '--:--'}
          </p>
          <p className="mt-3 text-sm text-sky-100/75">
            {roundIsPaused
              ? 'Đồng hồ đang tạm dừng theo trạng thái chính thức từ máy chủ'
              : roundIsRunning
                ? 'Thời gian chính thức do máy chủ xác định'
                : status === MatchStatus.BREAK
                  ? 'Chờ giám định viên bắt đầu Hiệp 2'
                  : status === MatchStatus.FINISHED
                    ? 'Trận đấu đã kết thúc'
                    : 'Chờ trạng thái chính thức từ máy chủ'}
          </p>

          {canStartRound ? (
            <>
              <section
                aria-labelledby="match-readiness-title"
                className="mx-auto mt-6 max-w-md rounded-2xl border border-white/15 bg-blue-950/30 p-4 text-left"
              >
                <h2 className="font-black" id="match-readiness-title">
                  Sẵn sàng trận đấu
                </h2>
                <ul className="mt-3 grid gap-2 text-sm font-semibold">
                  {refereeReadiness.map((referee) => (
                    <li
                      className={referee.connected ? 'text-emerald-200' : 'text-red-200'}
                      key={referee.label}
                    >
                      <span aria-hidden="true">{referee.connected ? '✓' : '✗'}</span>{' '}
                      {referee.label} {referee.connected ? 'đã kết nối' : 'chưa kết nối'}
                    </li>
                  ))}
                  <li
                    className={scoreboardConnectedCount > 0 ? 'text-emerald-200' : 'text-red-200'}
                  >
                    <span aria-hidden="true">{scoreboardConnectedCount > 0 ? '✓' : '✗'}</span> Bảng
                    điểm{' '}
                    {scoreboardConnectedCount > 0
                      ? `đã kết nối (${String(scoreboardConnectedCount)})`
                      : 'chưa kết nối'}
                  </li>
                </ul>
              </section>
              <Button
                className="mt-4 h-16 w-full max-w-md text-lg font-black"
                disabled={
                  realtime.connectionStatus !== 'connected' ||
                  realtime.startingRound ||
                  !participantsReady
                }
                onClick={() => void realtime.startRound()}
                type="button"
              >
                {realtime.startingRound ? 'ĐANG BẮT ĐẦU…' : startLabel}
              </Button>
              {!participantsReady ? (
                <p className="mx-auto mt-3 max-w-md text-sm font-semibold text-amber-100">
                  {readinessMessage}
                </p>
              ) : null}
            </>
          ) : null}

          {roundIsRunning || roundIsPaused ? (
            <Button
              className="mt-6 h-14 w-full max-w-md text-lg font-black"
              disabled={realtime.connectionStatus !== 'connected' || realtime.controllingRound}
              onClick={() => {
                setConfirmation(roundIsPaused ? 'resume' : 'pause');
              }}
              type="button"
              variant={roundIsPaused ? 'default' : 'outline'}
            >
              {realtime.controllingRound ? 'ĐANG XỬ LÝ…' : roundIsPaused ? 'TIẾP TỤC' : 'TẠM DỪNG'}
            </Button>
          ) : null}

          {realtime.roundControlErrorMessage ? (
            <p
              className="mx-auto mt-4 max-w-xl rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100"
              role="alert"
            >
              {realtime.roundControlErrorMessage}
            </p>
          ) : null}

          {status === MatchStatus.BREAK || status === MatchStatus.FINISHED ? (
            <div className="mx-auto mt-6 grid max-w-xl gap-3">
              <Button
                disabled={realtime.connectionStatus !== 'connected' || realtime.cancellingResults}
                onClick={() => {
                  setConfirmation('cancel-round');
                }}
                type="button"
                variant="outline"
              >
                {status === MatchStatus.BREAK
                  ? 'HỦY KẾT QUẢ HIỆP 1 VÀ BẮT ĐẦU LẠI'
                  : 'HỦY KẾT QUẢ HIỆP 2 VÀ BẮT ĐẦU LẠI'}
              </Button>
              {status === MatchStatus.FINISHED ? (
                <Button
                  disabled={realtime.connectionStatus !== 'connected' || realtime.cancellingResults}
                  onClick={() => {
                    setConfirmation('reset-match');
                  }}
                  type="button"
                  variant="outline"
                >
                  HỦY KẾT QUẢ VÀ BẮT ĐẦU LẠI 2 HIỆP ĐẤU
                </Button>
              ) : null}
            </div>
          ) : null}

          {realtime.resultCancellationErrorMessage ? (
            <p
              className="mx-auto mt-4 max-w-xl rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100"
              role="alert"
            >
              {realtime.resultCancellationErrorMessage}
            </p>
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
      {confirmation ? (
        <ConfirmationDialog
          actionLabel={
            confirmation === 'pause'
              ? 'Tạm dừng'
              : confirmation === 'resume'
                ? 'Tiếp tục'
                : confirmation === 'cancel-round'
                  ? 'Hủy kết quả hiệp'
                  : 'Đặt lại trận đấu'
          }
          busy={realtime.controllingRound || realtime.cancellingResults}
          description={
            confirmation === 'pause'
              ? 'Bạn có chắc muốn tạm dừng hiệp đấu hiện tại?'
              : confirmation === 'resume'
                ? 'Bạn có chắc muốn tiếp tục hiệp đấu?'
                : confirmation === 'cancel-round'
                  ? `Hủy kết quả Hiệp ${status === MatchStatus.BREAK ? '1' : '2'}?`
                  : 'Hủy toàn bộ kết quả trận đấu?'
          }
          onCancel={() => {
            setConfirmation(null);
          }}
          onConfirm={() => {
            const command =
              confirmation === 'pause'
                ? realtime.pauseRound()
                : confirmation === 'resume'
                  ? realtime.resumeRound()
                  : confirmation === 'cancel-round'
                    ? realtime.cancelRoundResult()
                    : realtime.resetMatchResults();
            void command.then((ok) => {
              if (ok) setConfirmation(null);
            });
          }}
          title="Xác nhận"
          warning={
            confirmation === 'reset-match'
              ? 'Tất cả điểm và lỗi của cả hai hiệp sẽ bị loại khỏi kết quả chính thức. Hành động này có thể được hoàn tác.'
              : confirmation === 'cancel-round'
                ? `Tất cả điểm trọng tài và lỗi trong Hiệp ${status === MatchStatus.BREAK ? '1' : '2'} sẽ bị loại khỏi kết quả chính thức. Hành động này có thể được hoàn tác.`
                : undefined
          }
        />
      ) : null}
    </div>
  );
}
