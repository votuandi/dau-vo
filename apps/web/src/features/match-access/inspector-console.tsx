import { useEffect, useRef, useState } from 'react';
import {
  AthleteColor,
  MatchExitMode,
  MatchStatus,
  type MatchCompletionBlockedReason,
} from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  getParticipantsNotReadyMessage,
  type MatchRealtimeState,
  type RealtimeConnectionStatus,
} from './match-realtime';
import { presentPhase } from '@/features/match-presentation';

interface InspectorConsoleProps {
  readonly realtime: MatchRealtimeState;
}

interface ExitOption {
  readonly description: string;
  readonly destructive: boolean;
  readonly title: string;
}

function exitOption(mode: MatchExitMode): ExitOption {
  switch (mode) {
    case MatchExitMode.CANCEL_RESULTS:
      return {
        title: 'Hủy kết quả',
        description: 'Toàn bộ kết quả hiện tại bị vô hiệu và trận trở về Chưa bắt đầu.',
        destructive: true,
      };
    case MatchExitMode.SUSPEND_KEEP_ROUND_1:
      return {
        title: 'Thoát và lưu kết quả hiệp 1',
        description: 'Dữ liệu hiệp 2 (nếu có) bị bỏ; trận chuyển sang Tạm hoãn.',
        destructive: false,
      };
    case MatchExitMode.SUSPEND_KEEP_ROUNDS_1_AND_2:
      return {
        title: 'Thoát và lưu kết quả 2 hiệp',
        description: 'Giữ cả hai hiệp, chưa chốt kết quả; trận chuyển sang Tạm hoãn.',
        destructive: false,
      };
    case MatchExitMode.SUSPEND_KEEP_V2_PHASE:
      return {
        title: 'Thoát và lưu trạng thái hiện tại',
        description: 'Giữ trạng thái V2 hiện tại để tiếp tục theo xác nhận của máy chủ.',
        destructive: false,
      };
    default:
      return mode satisfies never;
  }
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

const completionBlockedReasonLabels: Record<MatchCompletionBlockedReason, string> = {
  ALREADY_COMPLETED: 'Kết quả đã được lưu.',
  INVALIDATED_ROUND: 'Có hiệp đã bị hủy kết quả.',
  MATCH_SUSPENDED: 'Trận đang tạm hoãn.',
  NOT_AWAITING_RESULT_SAVE: 'Trận chưa ở bước chờ lưu kết quả.',
  RESULT_DECISION_REQUIRED: 'Cần xác định kết quả trận đấu trước khi lưu.',
  ROUND_1_NOT_ENDED: 'Hiệp 1 chưa kết thúc.',
  ROUND_2_NOT_ENDED: 'Hiệp 2 chưa kết thúc.',
  UNRESOLVED_SCORING_WINDOW: 'Đang chờ hoàn tất chấm điểm.',
};

type AppealDraft = Record<'redBonus' | 'redPenalty' | 'blueBonus' | 'bluePenalty', string>;
const emptyAppealDraft: AppealDraft = {
  redBonus: '0',
  redPenalty: '0',
  blueBonus: '0',
  bluePenalty: '0',
};
function appealNumber(value: string): number | null {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 99
    ? Number(value)
    : null;
}
function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function completionHelp(
  blockedReasons: readonly MatchCompletionBlockedReason[] | undefined,
): string {
  if (!blockedReasons) return 'Đang đồng bộ điều kiện lưu kết quả từ máy chủ.';
  if (blockedReasons.length === 0) return '';
  return blockedReasons.map((reason) => completionBlockedReasonLabels[reason]).join(' ');
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

function FaultButton({
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
      aria-label={`Ghi nhận lỗi VĐV ${colorLabel}`}
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

export function InspectorConsole({ realtime }: InspectorConsoleProps) {
  const snapshot = realtime.snapshot;
  const status = snapshot?.match.phase;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING ||
    status === MatchStatus.ROUND_2_RUNNING ||
    status === MatchStatus.OVERTIME_RUNNING;
  const roundIsPaused =
    status === MatchStatus.ROUND_1_PAUSED ||
    status === MatchStatus.ROUND_2_PAUSED ||
    status === MatchStatus.OVERTIME_PAUSED;
  const remainingTime = useServerDisplayTimer(
    roundIsRunning ? snapshot?.activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const [armedFault, setArmedFault] = useState<AthleteColor | null>(null);
  const [confirmation, setConfirmation] = useState<
    | 'pause'
    | 'resume'
    | 'cancel-round'
    | 'complete'
    | 'appeal'
    | 'start-overtime'
    | 'restart-overtime'
    | 'manual-red'
    | 'manual-blue'
    | 'publish-result'
    | null
  >(null);
  const [appealDraft, setAppealDraft] = useState<AppealDraft>(emptyAppealDraft);
  const [appealKey, setAppealKey] = useState(newIdempotencyKey);
  const [exitMenuOpen, setExitMenuOpen] = useState(false);
  const [exitConfirmation, setExitConfirmation] = useState<MatchExitMode | null>(null);
  const [exitAttempted, setExitAttempted] = useState(false);
  const exitMenuFirstOptionRef = useRef<HTMLButtonElement>(null);
  const displayedRemaining = roundIsPaused
    ? (snapshot?.activeRound?.remainingDurationMs ?? null)
    : remainingTime;
  const faultControlsDisabled =
    realtime.connectionStatus !== 'connected' ||
    !roundIsRunning ||
    realtime.submittingFault !== null;
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
  const completionBlockedReasons = snapshot?.completion.blockedReasons;
  const completionUnavailableMessage = completionHelp(completionBlockedReasons);
  const saveResultDisabled =
    realtime.connectionStatus !== 'connected' ||
    realtime.completingMatch ||
    snapshot?.completion.canComplete !== true;
  const exitDisabled =
    realtime.connectionStatus !== 'connected' ||
    realtime.cancellingResults ||
    !snapshot?.exit.canExit;
  const exitUnavailableMessage = realtime.cancellingResults
    ? 'Đang xử lý yêu cầu thoát trận…'
    : realtime.connectionStatus !== 'connected'
      ? 'Cần kết nối máy chủ để thoát trận.'
      : !snapshot
        ? 'Đang đồng bộ các lựa chọn thoát trận từ máy chủ.'
        : !snapshot.exit.canExit
          ? 'Chưa thể thoát trận theo trạng thái hiện tại do máy chủ xác định.'
          : '';

  useEffect(() => {
    if (armedFault === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setArmedFault(null);
    }, 1_800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [armedFault]);

  useEffect(() => {
    if (!roundIsRunning) {
      setArmedFault(null);
    }
  }, [roundIsRunning]);

  useEffect(() => {
    if (!exitMenuOpen) return;
    exitMenuFirstOptionRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExitMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [exitMenuOpen]);

  function handleFaultPress(athlete: AthleteColor): void {
    if (faultControlsDisabled) {
      return;
    }

    if (armedFault !== athlete) {
      setArmedFault(athlete);
      return;
    }

    setArmedFault(null);
    void realtime.submitFault(athlete);
  }
  const appealValues = {
    redBonus: appealNumber(appealDraft.redBonus),
    redPenalty: appealNumber(appealDraft.redPenalty),
    blueBonus: appealNumber(appealDraft.blueBonus),
    bluePenalty: appealNumber(appealDraft.bluePenalty),
  };
  const appealValid = Object.values(appealValues).every((value) => value !== null);
  const appealTitle =
    status === MatchStatus.REGULATION_APPEAL
      ? 'Phúc khảo sau hiệp 2'
      : `Phúc khảo hiệp phụ lần ${String(snapshot?.result.currentOvertimeAttempt?.attemptNumber ?? 1)}`;
  const appealContext =
    status === MatchStatus.OVERTIME_APPEAL
      ? snapshot?.result.overtimeAppeal
      : snapshot?.result.regulationAppeal;

  return (
    <div className="arena-background min-h-dvh text-white">
      <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-5 sm:py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-blue-950/35 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur-xl sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">
              Giám định
            </p>
            <p className="mt-1 truncate font-mono text-lg font-black tracking-[0.14em] text-white sm:text-xl">
              {snapshot?.match.publicId ?? 'Đang đồng bộ'}
            </p>
          </div>
          <div
            aria-live="polite"
            className="flex items-center gap-2 text-xs font-semibold text-sky-100/75"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${connectionDotClasses[realtime.connectionStatus]}`}
            />
            {connectionLabels[realtime.connectionStatus]}
          </div>
        </header>

        <section className="mt-3 rounded-3xl border border-white/15 bg-white/10 px-5 py-7 text-center shadow-2xl shadow-blue-950/20 backdrop-blur-xl sm:mt-5 sm:px-8 sm:py-9">
          <p className="text-sm font-black tracking-[0.2em] text-sky-200">
            {status ? presentPhase(status).label.toUpperCase() : 'ĐANG ĐỒNG BỘ'}
          </p>
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

          <div className="mx-auto mt-6 grid max-w-md gap-3 sm:grid-cols-2 sm:max-w-2xl">
            <div>
              <Button
                aria-describedby={saveResultDisabled ? 'save-result-help' : undefined}
                className="h-16 w-full text-lg font-black"
                disabled={saveResultDisabled}
                onClick={() => {
                  setConfirmation('complete');
                }}
                type="button"
              >
                {realtime.completingMatch ? 'ĐANG LƯU…' : 'LƯU KẾT QUẢ'}
              </Button>
              {saveResultDisabled ? (
                <p className="mt-3 text-sm font-semibold text-amber-100" id="save-result-help">
                  {realtime.connectionStatus !== 'connected'
                    ? 'Cần kết nối máy chủ để kiểm tra điều kiện lưu kết quả.'
                    : completionUnavailableMessage}
                </p>
              ) : null}
            </div>
            <div>
              <Button
                aria-describedby={exitDisabled ? 'exit-match-help' : undefined}
                className="h-16 w-full text-lg font-black"
                disabled={exitDisabled}
                onClick={() => {
                  setExitMenuOpen(true);
                }}
                type="button"
                variant="outline"
              >
                THOÁT TRẬN
              </Button>
              {exitDisabled ? (
                <p className="mt-3 text-sm font-semibold text-amber-100" id="exit-match-help">
                  {exitUnavailableMessage}
                </p>
              ) : null}
            </div>
          </div>

          {realtime.completionErrorMessage ? (
            <p
              className="mx-auto mt-4 max-w-xl rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100"
              role="alert"
            >
              {realtime.completionErrorMessage}
            </p>
          ) : null}

          {realtime.roundControlErrorMessage ? (
            <p
              className="mx-auto mt-4 max-w-xl rounded-xl bg-red-400/15 px-4 py-3 text-sm font-semibold text-red-100"
              role="alert"
            >
              {realtime.roundControlErrorMessage}
            </p>
          ) : null}

          {status === MatchStatus.BREAK ? (
            <div className="mx-auto mt-6 grid max-w-xl gap-3">
              <Button
                disabled={realtime.connectionStatus !== 'connected' || realtime.cancellingResults}
                onClick={() => {
                  setConfirmation('cancel-round');
                }}
                type="button"
                variant="outline"
              >
                HỦY KẾT QUẢ HIỆP 1 VÀ BẮT ĐẦU LẠI
              </Button>
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

        {status === MatchStatus.REGULATION_APPEAL || status === MatchStatus.OVERTIME_APPEAL ? (
          <section
            aria-labelledby="appeal-title"
            className="mt-3 rounded-3xl border border-amber-200/30 bg-amber-950/20 p-4 shadow-xl backdrop-blur-xl sm:mt-5 sm:p-6"
          >
            <h2 className="text-xl font-black" id="appeal-title">
              {appealTitle}
            </h2>
            <p className="mt-1 text-sm text-amber-100/85">
              Nhập số nguyên từ 0 đến 99. Bản xem trước chỉ để kiểm tra; máy chủ quyết định điểm
              chính thức.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['redBonus', 'Điểm cộng đỏ'],
                  ['redPenalty', 'Điểm phạt đỏ'],
                  ['blueBonus', 'Điểm cộng xanh'],
                  ['bluePenalty', 'Điểm phạt xanh'],
                ] as const
              ).map(([field, label]) => (
                <label className="grid gap-2 font-bold" key={field}>
                  {label}
                  <input
                    aria-invalid={appealNumber(appealDraft[field]) === null}
                    className="h-12 rounded-xl border border-white/25 bg-slate-950/40 px-3 text-lg text-white outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
                    inputMode="numeric"
                    min="0"
                    max="99"
                    pattern="[0-9]*"
                    value={appealDraft[field]}
                    onChange={(event) => {
                      setAppealDraft((draft) => ({ ...draft, [field]: event.target.value }));
                    }}
                  />
                  {appealNumber(appealDraft[field]) === null ? (
                    <span className="text-sm text-red-200" role="alert">
                      Nhập một số nguyên từ 0 đến 99.
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-live="polite">
              {[redAthlete, blueAthlete].map((athlete) => {
                if (!athlete) return null;
                const red = athlete.color === AthleteColor.RED;
                const bonus = red ? appealValues.redBonus : appealValues.blueBonus;
                const penalty = red ? appealValues.redPenalty : appealValues.bluePenalty;
                const base = appealContext?.breakdown[athlete.color]?.base;
                return (
                  <p className="rounded-xl bg-white/10 p-3 text-sm" key={athlete.id}>
                    <strong>
                      {red ? 'ĐỎ' : 'XANH'} — {athlete.name}:
                    </strong>{' '}
                    Điểm trọng tài {base ?? '—'} + Điểm cộng {bonus ?? '—'} − Điểm phạt{' '}
                    {penalty ?? '—'} ={' '}
                    <strong>
                      Điểm chung cuộc{' '}
                      {bonus === null || penalty === null || base === undefined
                        ? '—'
                        : Math.max(0, base + bonus - penalty)}
                    </strong>
                  </p>
                );
              })}
            </div>
            <Button
              className="mt-5 min-h-14 w-full text-lg font-black"
              disabled={
                !appealValid ||
                realtime.connectionStatus !== 'connected' ||
                realtime.submittingResultAction ||
                appealContext?.canComplete !== true
              }
              onClick={() => {
                setConfirmation('appeal');
              }}
              type="button"
            >
              {realtime.submittingResultAction ? 'ĐANG HOÀN THÀNH…' : 'HOÀN THÀNH PHÚC KHẢO'}
            </Button>
            {realtime.resultActionErrorMessage ? (
              <p
                className="mt-3 rounded-xl bg-red-400/15 p-3 text-sm font-semibold text-red-100"
                role="alert"
              >
                {realtime.resultActionErrorMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        <section aria-label="Hành động kết quả" className="mt-3 grid gap-3 sm:grid-cols-2">
          {snapshot?.result.tieBreak.canStartOvertime ? (
            <Button
              className="min-h-14 text-lg font-black"
              disabled={
                realtime.connectionStatus !== 'connected' || realtime.submittingResultAction
              }
              onClick={() => {
                setConfirmation('start-overtime');
              }}
              type="button"
            >
              BẮT ĐẦU HIỆP PHỤ
            </Button>
          ) : null}
          {snapshot?.result.publication.canPublish ? (
            <Button
              className="min-h-14 text-lg font-black"
              disabled={
                realtime.connectionStatus !== 'connected' || realtime.submittingResultAction
              }
              onClick={() => {
                setConfirmation('publish-result');
              }}
              type="button"
            >
              CÔNG BỐ KẾT QUẢ
            </Button>
          ) : null}
          {snapshot?.result.tieBreak.canRestartOvertime ? (
            <Button
              className="min-h-14 text-lg font-black"
              onClick={() => {
                setConfirmation('restart-overtime');
              }}
              type="button"
              variant="outline"
            >
              ĐẤU LẠI HIỆP PHỤ
            </Button>
          ) : null}
          {snapshot?.result.tieBreak.canSelectManualWinner ? (
            <div className="rounded-2xl border border-amber-200/30 p-3 sm:col-span-2">
              <p className="font-black">CHỌN NGƯỜI CHIẾN THẮNG</p>
              <p className="mt-1 text-sm text-amber-100">
                Điểm chung cuộc hiệp phụ đang hòa. Chọn kết quả chính thức.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Button
                  disabled={
                    realtime.connectionStatus !== 'connected' || realtime.submittingResultAction
                  }
                  onClick={() => {
                    setConfirmation('manual-red');
                  }}
                  type="button"
                  variant="outline"
                >
                  ĐỎ — {redAthlete?.name ?? 'VĐV đỏ'}
                </Button>
                <Button
                  disabled={
                    realtime.connectionStatus !== 'connected' || realtime.submittingResultAction
                  }
                  onClick={() => {
                    setConfirmation('manual-blue');
                  }}
                  type="button"
                  variant="outline"
                >
                  XANH — {blueAthlete?.name ?? 'VĐV xanh'}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="inspector-fault-title"
          className="mt-3 rounded-3xl border border-white/15 bg-white/10 p-4 shadow-xl shadow-blue-950/15 backdrop-blur-xl sm:mt-5 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="text-lg font-black" id="inspector-fault-title">
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
            <FaultButton
              athlete={AthleteColor.RED}
              disabled={faultControlsDisabled}
              isArmed={armedFault === AthleteColor.RED}
              isSubmitting={realtime.submittingFault === AthleteColor.RED}
              onPress={handleFaultPress}
            />
            <FaultButton
              athlete={AthleteColor.BLUE}
              disabled={faultControlsDisabled}
              isArmed={armedFault === AthleteColor.BLUE}
              isSubmitting={realtime.submittingFault === AthleteColor.BLUE}
              onPress={handleFaultPress}
            />
          </div>

          <div aria-live="polite" className="mt-4 min-h-6 text-sm">
            {armedFault ? (
              <p className="font-semibold text-amber-200">
                Nhấn LỖI {armedFault === AthleteColor.RED ? 'ĐỎ' : 'XANH'} lần nữa để xác nhận.
              </p>
            ) : realtime.faultErrorMessage ? (
              <p
                className="rounded-xl bg-red-400/15 px-4 py-3 font-semibold text-red-100"
                role="alert"
              >
                {realtime.faultErrorMessage}
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
                  : confirmation === 'appeal'
                    ? 'Xác nhận phúc khảo'
                    : confirmation === 'start-overtime'
                      ? 'Bắt đầu hiệp phụ'
                      : confirmation === 'restart-overtime'
                        ? 'Đấu lại hiệp phụ'
                        : confirmation === 'manual-red'
                          ? `Chọn ĐỎ — ${redAthlete?.name ?? 'VĐV đỏ'}`
                          : confirmation === 'manual-blue'
                            ? `Chọn XANH — ${blueAthlete?.name ?? 'VĐV xanh'}`
                            : confirmation === 'publish-result'
                              ? 'Công bố kết quả'
                              : 'Lưu kết quả'
          }
          busy={
            realtime.controllingRound ||
            realtime.cancellingResults ||
            realtime.completingMatch ||
            realtime.submittingResultAction
          }
          description={
            confirmation === 'pause'
              ? 'Bạn có chắc muốn tạm dừng hiệp đấu hiện tại?'
              : confirmation === 'resume'
                ? 'Bạn có chắc muốn tiếp tục hiệp đấu?'
                : confirmation === 'cancel-round'
                  ? `Hủy kết quả Hiệp ${status === MatchStatus.BREAK ? '1' : '2'}?`
                  : confirmation === 'appeal'
                    ? 'Phúc khảo này sẽ được khóa sau khi cam kết. Hãy kiểm tra kỹ các điều chỉnh trước khi xác nhận.'
                    : confirmation === 'start-overtime'
                      ? 'Hiệp phụ sẽ bắt đầu theo trạng thái chính thức từ máy chủ. Không thể hoàn tác việc bắt đầu hiệp đang diễn ra.'
                      : confirmation === 'restart-overtime'
                        ? 'Kết quả hiệp phụ hòa sẽ bị thay bằng một hiệp phụ mới.'
                        : confirmation === 'manual-red' || confirmation === 'manual-blue'
                          ? `Điểm chung cuộc hiệp phụ đang hòa. Chọn người chiến thắng chính thức: ${confirmation === 'manual-red' ? `ĐỎ — ${redAthlete?.name ?? 'VĐV đỏ'}` : `XANH — ${blueAthlete?.name ?? 'VĐV xanh'}`}.`
                          : confirmation === 'publish-result'
                            ? 'Công bố kết quả sẽ phát hành người chiến thắng cho bảng điểm công khai và luồng nhánh đấu. Không thể hoàn tác tại đây.'
                            : 'Xác nhận lưu kết quả chính thức. Kết quả có thể làm nhánh đấu chuyển tiếp.'
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
                    : confirmation === 'appeal'
                      ? realtime.completeAppeal({
                          RED: {
                            bonusPoints: appealValues.redBonus ?? 0,
                            penaltyPoints: appealValues.redPenalty ?? 0,
                          },
                          BLUE: {
                            bonusPoints: appealValues.blueBonus ?? 0,
                            penaltyPoints: appealValues.bluePenalty ?? 0,
                          },
                          idempotencyKey: appealKey,
                        })
                      : confirmation === 'start-overtime'
                        ? realtime.startOvertime()
                        : confirmation === 'restart-overtime'
                          ? realtime.restartOvertime()
                          : confirmation === 'manual-red'
                            ? realtime.selectManualWinner(AthleteColor.RED)
                            : confirmation === 'manual-blue'
                              ? realtime.selectManualWinner(AthleteColor.BLUE)
                              : confirmation === 'publish-result'
                                ? realtime.publishResult()
                                : realtime.publishResult();
            void command.then((ok) => {
              if (ok) {
                if (confirmation === 'appeal') {
                  setAppealDraft(emptyAppealDraft);
                  setAppealKey(newIdempotencyKey());
                }
                setConfirmation(null);
              }
            });
          }}
          title="Xác nhận"
          warning={
            confirmation === 'cancel-round'
              ? `Tất cả điểm trọng tài và lỗi trong Hiệp ${status === MatchStatus.BREAK ? '1' : '2'} sẽ bị loại khỏi kết quả chính thức. Hành động này có thể được hoàn tác.`
              : confirmation === 'appeal' ||
                  confirmation === 'start-overtime' ||
                  confirmation === 'restart-overtime' ||
                  confirmation === 'manual-red' ||
                  confirmation === 'manual-blue' ||
                  confirmation === 'publish-result'
                ? 'Thao tác này cần xác nhận và chỉ máy chủ mới xác lập kết quả chính thức.'
                : undefined
          }
        />
      ) : null}
      {exitMenuOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-end bg-slate-950/75 p-4 sm:place-items-center"
          role="dialog"
          aria-label="Chọn cách thoát trận"
        >
          <section className="w-full max-w-lg rounded-2xl border border-white/15 bg-blue-950 p-5 text-white shadow-2xl">
            <h2 className="text-xl font-black">Thoát trận</h2>
            <p className="mt-2 text-sm text-sky-100">Chọn cách xử lý kết quả trước khi rời trận.</p>
            <div className="mt-5 grid gap-3">
              {snapshot?.exit.allowedModes.map((mode, index) => {
                const option = exitOption(mode);
                return (
                  <button
                    className={`min-h-20 rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-4 ${option.destructive ? 'border-red-300/50 bg-red-950/40 focus-visible:ring-red-300' : 'border-sky-300/40 bg-white/10 focus-visible:ring-sky-300'}`}
                    disabled={realtime.cancellingResults}
                    key={mode}
                    ref={index === 0 ? exitMenuFirstOptionRef : undefined}
                    onClick={() => {
                      setExitMenuOpen(false);
                      setExitAttempted(false);
                      setExitConfirmation(mode);
                    }}
                    type="button"
                  >
                    <span className="block font-black">{option.title}</span>
                    <span className="mt-1 block text-sm text-sky-100">{option.description}</span>
                  </button>
                );
              })}
            </div>
            <Button
              className="mt-5"
              disabled={realtime.cancellingResults}
              onClick={() => {
                setExitMenuOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Đóng
            </Button>
          </section>
        </div>
      ) : null}
      {exitConfirmation ? (
        <ConfirmationDialog
          actionLabel={exitOption(exitConfirmation).title}
          busy={realtime.cancellingResults}
          description={exitOption(exitConfirmation).description}
          onCancel={() => {
            setExitAttempted(false);
            setExitConfirmation(null);
          }}
          onConfirm={() => {
            setExitAttempted(true);
            void realtime.exitMatch(exitConfirmation).then((ok) => {
              if (ok) {
                setExitAttempted(false);
                setExitConfirmation(null);
              }
            });
          }}
          title="Xác nhận thoát trận"
          warning={
            [
              exitOption(exitConfirmation).destructive
                ? 'Kết quả hiện tại sẽ bị vô hiệu. Bạn vẫn có thể xem lịch sử thao tác.'
                : undefined,
              exitAttempted ? (realtime.resultCancellationErrorMessage ?? undefined) : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
      ) : null}
    </div>
  );
}
