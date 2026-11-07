import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MatchStatus } from '@martial-arts-scoring/shared-types';
import { useScoreboardRealtime } from '@/features/scoreboard/scoreboard-realtime';
import { IntermissionCountdown, useIntermissionActive } from '@/components/intermission-countdown';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  buildScoreboardViewModel,
  normalizeMatchId,
  scoreboardPath,
  type ScoreboardTheme,
} from '@/features/scoreboard/scoreboard-view-model';
import { SupervisorScoreboard } from '@/features/scoreboard/supervisor-scoreboard';
import { AthletePanel } from '@/features/scoreboard/components/athlete-panel';
import { JudgeVoteStrip } from '@/features/scoreboard/components/judge-vote-strip';
import { ScoreboardAccessForm } from '@/features/scoreboard/components/scoreboard-access-form';
import { ScoreboardHeader } from '@/features/scoreboard/components/scoreboard-header';
import type { ScoreboardSource } from '@/features/scoreboard/scoreboard-source';
import { ScoreboardClock } from '@/features/scoreboard/components/scoreboard-clock';
import { WinnerPresentation } from '@/features/scoreboard/components/winner-presentation';
import { useScreenWakeLock } from '@/features/scoreboard/display-controls';

const THEME_BACKGROUND: Record<ScoreboardTheme, string> = {
  arena: 'arena-background',
  attention: 'bg-gradient-to-br from-amber-950 via-yellow-800 to-amber-950',
  'red-winner': 'bg-gradient-to-br from-red-500 via-red-700 to-red-950',
  'blue-winner': 'bg-gradient-to-br from-sky-500 via-blue-700 to-blue-950',
};

interface ScoreboardLocationState {
  readonly scoreboardSource?: Extract<ScoreboardSource, { kind: 'supervisor' }>;
  readonly previousSource?: ScoreboardSource;
}

export function ScoreboardPage() {
  const { matchId: pathMatchId } = useParams<{ matchId: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const matchPublicId = normalizeMatchId(pathMatchId ?? params.get('match') ?? '');
  const supervisor = (location.state as ScoreboardLocationState | null)?.scoreboardSource;
  const source: ScoreboardSource | undefined = matchPublicId
    ? { kind: 'match', matchPublicId }
    : supervisor;
  function select(next: ScoreboardSource) {
    if (next.kind === 'match') {
      void navigate(scoreboardPath(next.matchPublicId), { state: { previousSource: source } });
    } else {
      void navigate('/bang-diem', { state: { scoreboardSource: next } });
    }
  }
  if (matchPublicId)
    return (
      <ScoreboardContent
        matchPublicId={matchPublicId}
        source={{ kind: 'match', matchPublicId }}
        onSelect={select}
      />
    );
  if (supervisor)
    return (
      <SupervisorScoreboard
        key={location.key}
        source={supervisor}
        onSelect={select}
        renderMatch={(id, reconnecting) => (
          <ScoreboardContent
            key={id}
            matchPublicId={id}
            source={supervisor}
            trackingDisconnected={reconnecting}
            onSelect={select}
          />
        )}
      />
    );
  return (
    <main className="arena-background grid min-h-dvh place-items-center p-4 text-white sm:p-6">
      <div className="w-full max-w-lg space-y-6 rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
        <h1 className="text-3xl font-black">Bảng điểm</h1>
        <p className="text-sm leading-6 text-slate-600">
          Nhập mã trận đấu hoặc mã giám sát để hiển thị bảng điểm trực tiếp.
        </p>
        <ScoreboardAccessForm onSelect={select} />
      </div>
    </main>
  );
}

function ScoreboardContent({
  matchPublicId,
  source,
  trackingDisconnected = false,
  onSelect,
}: {
  readonly matchPublicId: string;
  readonly source: ScoreboardSource;
  readonly trackingDisconnected?: boolean;
  readonly onSelect: (source: ScoreboardSource) => void;
}) {
  const { connectionStatus, snapshot } = useScoreboardRealtime(matchPublicId);
  const followingSupervisor = source.kind === 'supervisor';
  const location = useLocation();
  const navigate = useNavigate();
  const invalidMatchHandled = useRef(false);
  const previousSource = (location.state as ScoreboardLocationState | null)?.previousSource;
  useScreenWakeLock();

  useEffect(() => {
    invalidMatchHandled.current = false;
  }, [matchPublicId]);

  useEffect(() => {
    if (
      !followingSupervisor &&
      previousSource &&
      connectionStatus === 'disconnected' &&
      snapshot === null &&
      !invalidMatchHandled.current
    ) {
      invalidMatchHandled.current = true;
      toast({ title: 'Mã trận đấu không chính xác', variant: 'destructive' });
      if (previousSource.kind === 'match')
        void navigate(scoreboardPath(previousSource.matchPublicId), { replace: true });
      else
        void navigate('/bang-diem', { replace: true, state: { scoreboardSource: previousSource } });
    }
  }, [connectionStatus, followingSupervisor, navigate, previousSource, snapshot]);

  const intermission = useIntermissionActive(
    snapshot?.match.phase === MatchStatus.BREAK ? snapshot.intermissionEndsAt : null,
    snapshot?.generatedAt,
  );
  const view = buildScoreboardViewModel(snapshot, intermission.active);
  const attention = view.theme === 'attention';
  const activeRound = snapshot?.activeRound;

  return (
    <main
      className={cn(
        'flex flex-col gap-[clamp(0.5rem,1.6vmin,1.25rem)] p-[clamp(0.5rem,1.6vmin,1.25rem)] text-white transition-colors duration-500',
        'min-h-dvh',
        THEME_BACKGROUND[view.theme],
      )}
    >
      <ScoreboardHeader
        source={source}
        onSelect={onSelect}
        status={trackingDisconnected ? 'disconnected' : connectionStatus}
        hasSnapshot={snapshot !== null}
        attention={attention}
        matchPublicId={snapshot?.match.publicId ?? matchPublicId}
      />

      {view.winner ? (
        <WinnerPresentation athlete={view.winner} note={view.winnerNote} />
      ) : (
        <>
          <section
            aria-label="Trạng thái trận đấu"
            className={cn(
              'flex flex-col items-center rounded-[clamp(1rem,3vmin,2rem)] border px-4 py-[clamp(0.5rem,2vmin,1.5rem)] text-center shadow-2xl backdrop-blur-xl',
              attention
                ? 'border-amber-200/40 bg-amber-950/30 shadow-amber-950/30'
                : 'border-white/15 bg-white/10 shadow-blue-950/20',
            )}
          >
            <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1">
              <p className="text-[clamp(1.125rem,4vmin,2.25rem)] font-black uppercase tracking-[0.18em] text-sky-100">
                {view.presentation?.label ?? 'ĐANG KẾT NỐI'}
              </p>
              {view.roundLabel ? (
                <p className="text-[clamp(0.875rem,2.6vmin,1.375rem)] font-black tracking-[0.12em] text-amber-200">
                  {view.roundLabel}
                </p>
              ) : null}
            </div>
            {view.presentation ? (
              <p className="mt-1 text-[clamp(0.75rem,1.8vmin,1rem)] text-sky-100/85 short:hidden">
                {view.presentation.help}
              </p>
            ) : null}
            {intermission.active ? null : (
              <div className="mt-[clamp(0.25rem,1vmin,0.75rem)]">
                <ScoreboardClock
                  endsAt={activeRound?.endsAt}
                  generatedAt={snapshot?.generatedAt}
                  pausedRemainingMs={
                    view.paused ? (activeRound?.remainingDurationMs ?? null) : null
                  }
                  running={view.running}
                />
              </div>
            )}
            <IntermissionCountdown
              endsAt={view.intermissionEndsAt}
              generatedAt={snapshot?.generatedAt}
            />
          </section>

          <p
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border short:hidden border-amber-200/30 bg-amber-100/10 px-4 py-2 text-center text-[clamp(0.75rem,1.9vmin,1.125rem)] font-bold text-amber-100 backdrop-blur"
            role="status"
          >
            <span>Chưa công bố kết quả — chưa có người chiến thắng được xác nhận.</span>
            {view.committedScoresLabel ? (
              <span className="text-amber-50">{view.committedScoresLabel}</span>
            ) : null}
          </p>

          <JudgeVoteStrip generatedAt={snapshot?.generatedAt} judgeVotes={snapshot?.judgeVotes} />

          <section
            aria-label="Điểm số hai góc"
            className="grid flex-1 gap-[clamp(0.5rem,1.6vmin,1.25rem)] md:grid-cols-2 landscape:grid-cols-2"
          >
            <AthletePanel athlete={view.red} />
            <AthletePanel athlete={view.blue} />
          </section>
        </>
      )}
    </main>
  );
}
