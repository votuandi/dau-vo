import { useEffect, useRef, useState } from 'react';
import {
  AthleteColor,
  MatchAccessRole,
  MatchStatus,
  type MatchPresenceEntry,
} from '@/types/shared';
import type { MatchRealtimeState } from '@/features/match-access/match-realtime';
import { Button } from '@/components/ui/button';

interface MatchRealtimePanelProps {
  readonly canStartRound: boolean;
  readonly canAddPenalty: boolean;
  readonly canSubmitVote: boolean;
  readonly realtime: MatchRealtimeState;
}

const accessRoles = [
  MatchAccessRole.REFEREE_1,
  MatchAccessRole.REFEREE_2,
  MatchAccessRole.REFEREE_3,
  MatchAccessRole.INSPECTOR,
] as const;

const accessRoleLabels: Record<MatchAccessRole, string> = {
  [MatchAccessRole.REFEREE_1]: 'Trọng tài 1',
  [MatchAccessRole.REFEREE_2]: 'Trọng tài 2',
  [MatchAccessRole.REFEREE_3]: 'Trọng tài 3',
  [MatchAccessRole.INSPECTOR]: 'Giám định',
};

const matchStatusLabels: Record<MatchStatus, string> = {
  [MatchStatus.WAITING]: 'Đang chờ',
  [MatchStatus.ROUND_1_RUNNING]: 'Hiệp 1 đang diễn ra',
  [MatchStatus.BREAK]: 'Nghỉ giữa hiệp',
  [MatchStatus.ROUND_2_RUNNING]: 'Hiệp 2 đang diễn ra',
  [MatchStatus.FINISHED]: 'Đã kết thúc',
};

const connectionPresentation = {
  'authentication-required': {
    dotClass: 'bg-red-500',
    label: 'Cần đăng nhập lại',
  },
  connecting: {
    dotClass: 'bg-amber-500',
    label: 'Đang kết nối',
  },
  connected: {
    dotClass: 'bg-emerald-500',
    label: 'Đã kết nối',
  },
  reconnecting: {
    dotClass: 'bg-amber-500',
    label: 'Đang kết nối lại',
  },
  disconnected: {
    dotClass: 'bg-slate-400',
    label: 'Mất kết nối',
  },
  error: {
    dotClass: 'bg-red-500',
    label: 'Mất kết nối',
  },
  revoked: {
    dotClass: 'bg-red-500',
    label: 'Phiên đã bị thu hồi',
  },
} as const;

function PresenceStatus({ entry }: { readonly entry: MatchPresenceEntry | undefined }) {
  if (entry?.connected) {
    return (
      <span className="text-xs font-semibold text-emerald-700">
        Đang trực tuyến
        {entry.connectedSocketCount > 1 ? ` · ${String(entry.connectedSocketCount)} kết nối` : ''}
      </span>
    );
  }

  if (entry?.activeSession) {
    return <span className="text-xs font-semibold text-amber-700">Đã xác thực · ngoại tuyến</span>;
  }

  return <span className="text-xs font-semibold text-muted-foreground">Chưa xác thực</span>;
}

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function useRemainingTime(
  endsAt: string | undefined,
  serverGeneratedAt: string | undefined,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  const serverClockOffset = useRef(0);

  useEffect(() => {
    const localNow = Date.now();
    const generatedAt = serverGeneratedAt ? new Date(serverGeneratedAt).getTime() : Number.NaN;
    serverClockOffset.current = Number.isNaN(generatedAt) ? 0 : generatedAt - localNow;
    setNow(localNow);

    if (!endsAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, serverGeneratedAt]);

  if (!endsAt) {
    return null;
  }

  const end = new Date(endsAt).getTime();
  return Number.isNaN(end) ? null : Math.max(0, end - (now + serverClockOffset.current));
}

function MatchLifecycle({
  canStartRound,
  realtime,
}: {
  readonly canStartRound: boolean;
  readonly realtime: MatchRealtimeState;
}) {
  const snapshot = realtime.snapshot;
  const status = snapshot?.match.status;
  const isRoundRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const remainingTime = useRemainingTime(
    isRoundRunning ? snapshot?.activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const mayStartFromCurrentState = status === MatchStatus.WAITING || status === MatchStatus.BREAK;
  const roundStartLabel = status === MatchStatus.BREAK ? 'Bắt đầu Hiệp 2' : 'Bắt đầu Hiệp 1';

  let phaseLabel = 'Đang đồng bộ trạng thái…';
  if (status === MatchStatus.WAITING) {
    phaseLabel = 'Chờ bắt đầu Hiệp 1';
  } else if (status === MatchStatus.ROUND_1_RUNNING) {
    phaseLabel = 'Hiệp 1';
  } else if (status === MatchStatus.BREAK) {
    phaseLabel = 'BREAK';
  } else if (status === MatchStatus.ROUND_2_RUNNING) {
    phaseLabel = 'Hiệp 2';
  } else if (status === MatchStatus.FINISHED) {
    phaseLabel = 'FINISHED';
  }

  return (
    <section
      aria-labelledby="match-lifecycle-title"
      className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-white"
    >
      <div className="p-5 sm:p-6">
        <p
          className="text-xs font-black uppercase tracking-[0.2em] text-slate-400"
          id="match-lifecycle-title"
        >
          Đồng hồ thi đấu
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{phaseLabel}</p>
            {isRoundRunning ? (
              <p className="mt-1 text-xs text-slate-400">Thời gian kết thúc do máy chủ xác định</p>
            ) : status === MatchStatus.BREAK ? (
              <p className="mt-1 text-xs text-slate-400">
                Giám định viên bắt đầu Hiệp 2 khi sẵn sàng
              </p>
            ) : null}
          </div>

          {isRoundRunning ? (
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Còn lại</p>
              <p
                aria-label={`Thời gian còn lại ${formatRemainingTime(remainingTime ?? 0)}`}
                className="mt-1 font-mono text-4xl font-black tabular-nums sm:text-5xl"
                role="timer"
              >
                {remainingTime === null ? '--:--' : formatRemainingTime(remainingTime)}
              </p>
            </div>
          ) : null}
        </div>

        {canStartRound && mayStartFromCurrentState ? (
          <div className="mt-6 border-t border-slate-800 pt-5">
            <Button
              className="bg-white text-slate-950 hover:bg-slate-200"
              disabled={realtime.connectionStatus !== 'connected' || realtime.startingRound}
              onClick={() => void realtime.startRound()}
              type="button"
            >
              {realtime.startingRound ? 'Đang bắt đầu…' : roundStartLabel}
            </Button>
            {realtime.connectionStatus !== 'connected' ? (
              <p className="mt-2 text-xs text-amber-300">
                Cần kết nối thời gian thực trước khi bắt đầu hiệp.
              </p>
            ) : null}
          </div>
        ) : null}

        {realtime.roundStartErrorMessage ? (
          <p
            className="mt-4 rounded-lg border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {realtime.roundStartErrorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RefereeVoteControls({ realtime }: { readonly realtime: MatchRealtimeState }) {
  const status = realtime.snapshot?.match.status;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const controlsEnabled =
    realtime.connectionStatus === 'connected' &&
    roundIsRunning &&
    realtime.submittingVote === null &&
    realtime.lastAcceptedVote === null;

  return (
    <section aria-labelledby="referee-vote-title" className="rounded-xl border border-border p-4">
      <h2 className="text-sm font-black uppercase tracking-wider" id="referee-vote-title">
        Lựa chọn chấm điểm
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Chọn võ sĩ vừa thực hiện đòn hợp lệ. Máy chủ quyết định cửa sổ và kết quả chấm điểm.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          className="bg-red-700 text-white hover:bg-red-800"
          disabled={!controlsEnabled}
          onClick={() => void realtime.submitVote(AthleteColor.RED)}
          size="lg"
          type="button"
        >
          {realtime.submittingVote === AthleteColor.RED ? 'Đang gửi…' : 'ĐỎ'}
        </Button>
        <Button
          className="bg-blue-700 text-white hover:bg-blue-800"
          disabled={!controlsEnabled}
          onClick={() => void realtime.submitVote(AthleteColor.BLUE)}
          size="lg"
          type="button"
        >
          {realtime.submittingVote === AthleteColor.BLUE ? 'Đang gửi…' : 'XANH'}
        </Button>
      </div>

      {!roundIsRunning ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Lựa chọn chỉ được mở trong Hiệp 1 hoặc Hiệp 2.
        </p>
      ) : null}

      {realtime.lastAcceptedVote ? (
        <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">
          Máy chủ đã ghi nhận lựa chọn{' '}
          {realtime.lastAcceptedVote.athlete === AthleteColor.RED ? 'ĐỎ' : 'XANH'}.
        </p>
      ) : null}

      {realtime.scoringWindowMessage ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {realtime.scoringWindowMessage}
        </p>
      ) : null}

      {realtime.voteSubmitErrorMessage ? (
        <p
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {realtime.voteSubmitErrorMessage}
        </p>
      ) : null}
    </section>
  );
}

function InspectorPenaltyControls({ realtime }: { readonly realtime: MatchRealtimeState }) {
  const status = realtime.snapshot?.match.status;
  const roundIsRunning =
    status === MatchStatus.ROUND_1_RUNNING || status === MatchStatus.ROUND_2_RUNNING;
  const controlsEnabled =
    realtime.connectionStatus === 'connected' &&
    roundIsRunning &&
    realtime.submittingPenalty === null;

  return (
    <section
      aria-labelledby="inspector-penalty-title"
      className="rounded-xl border border-border p-4"
    >
      <h2 className="text-sm font-black uppercase tracking-wider" id="inspector-penalty-title">
        Ghi nhận lỗi
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Mỗi lần ghi lỗi trừ một điểm và tăng số lỗi của võ sĩ. Máy chủ ghi nhận hành động này.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          className="bg-red-700 text-white hover:bg-red-800"
          disabled={!controlsEnabled}
          onClick={() => void realtime.submitPenalty(AthleteColor.RED)}
          size="lg"
          type="button"
        >
          {realtime.submittingPenalty === AthleteColor.RED ? 'Đang ghi…' : 'ĐỎ VI PHẠM'}
        </Button>
        <Button
          className="bg-blue-700 text-white hover:bg-blue-800"
          disabled={!controlsEnabled}
          onClick={() => void realtime.submitPenalty(AthleteColor.BLUE)}
          size="lg"
          type="button"
        >
          {realtime.submittingPenalty === AthleteColor.BLUE ? 'Đang ghi…' : 'XANH VI PHẠM'}
        </Button>
      </div>
      {realtime.penaltyErrorMessage ? (
        <p
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {realtime.penaltyErrorMessage}
        </p>
      ) : null}
    </section>
  );
}

export function MatchRealtimePanel({
  canAddPenalty,
  canStartRound,
  canSubmitVote,
  realtime,
}: MatchRealtimePanelProps) {
  const connection = connectionPresentation[realtime.connectionStatus];
  const presenceByRole = new Map(realtime.presence.map((entry) => [entry.accessRole, entry]));

  return (
    <div className="mt-6 space-y-5">
      <MatchLifecycle canStartRound={canStartRound} realtime={realtime} />

      {canSubmitVote ? <RefereeVoteControls realtime={realtime} /> : null}
      {canAddPenalty ? <InspectorPenaltyControls realtime={realtime} /> : null}

      <section className="rounded-xl border border-border bg-muted/30 p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Kết nối thời gian thực
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${connection.dotClass}`} />
              {connection.label}
            </div>
          </div>

          {realtime.connectionStatus === 'error' || realtime.connectionStatus === 'disconnected' ? (
            <Button onClick={realtime.reconnect} size="sm" type="button" variant="outline">
              Kết nối lại
            </Button>
          ) : realtime.connectionStatus === 'connected' ? (
            <Button onClick={realtime.requestSnapshot} size="sm" type="button" variant="outline">
              Làm mới trạng thái
            </Button>
          ) : null}
        </div>

        {realtime.errorMessage ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {realtime.errorMessage}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="presence-title">
        <h2 className="text-sm font-black uppercase tracking-wider" id="presence-title">
          Hiện diện trong trận
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          “Đã xác thực” thể hiện chủ sở hữu phiên; “trực tuyến” thể hiện kết nối socket hiện tại.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {accessRoles.map((accessRole) => {
            const entry = presenceByRole.get(accessRole);
            return (
              <div className="rounded-lg border border-border bg-background p-3" key={accessRole}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">{accessRoleLabels[accessRole]}</span>
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${
                      entry?.connected
                        ? 'bg-emerald-500'
                        : entry?.activeSession
                          ? 'bg-amber-500'
                          : 'bg-slate-300'
                    }`}
                  />
                </div>
                <div className="mt-1">
                  <PresenceStatus entry={entry} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="snapshot-title">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-wider" id="snapshot-title">
            Trạng thái trận đấu
          </h2>
          {realtime.snapshot ? (
            <span className="text-xs text-muted-foreground">
              Cập nhật {new Date(realtime.snapshot.generatedAt).toLocaleTimeString('vi-VN')}
            </span>
          ) : null}
        </div>

        {realtime.snapshot ? (
          <div className="mt-3 rounded-xl border border-border bg-background p-4">
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Trạng thái: </span>
                <strong>{matchStatusLabels[realtime.snapshot.match.status]}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Hiệp hiện tại: </span>
                <strong>{realtime.snapshot.match.currentRound ?? 'Chưa bắt đầu'}</strong>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {realtime.snapshot.athletes.map((athlete) => (
                <div className="rounded-lg bg-muted/50 p-3" key={athlete.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Võ sĩ {athlete.color}
                      </p>
                      <p className="mt-1 font-bold">{athlete.name}</p>
                      <p className="text-xs text-muted-foreground">{athlete.organization}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Lỗi vi phạm: {athlete.violations}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Điểm hiện tại</p>
                      <p className="text-2xl font-black">{athlete.score}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            {realtime.connectionStatus === 'connected'
              ? 'Đang tải trạng thái mới nhất từ máy chủ…'
              : 'Trạng thái sẽ được tải sau khi kết nối thành công.'}
          </div>
        )}
      </section>
    </div>
  );
}
