import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MatchStatus } from '@martial-arts-scoring/shared-types';
import {
  useScoreboardRealtime,
  type ScoreboardConnectionStatus,
} from '@/features/scoreboard/scoreboard-realtime';
import { IntermissionCountdown, useIntermissionActive } from '@/components/intermission-countdown';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  buildScoreboardViewModel,
  normalizeMatchId,
  scoreboardPath,
  type ScoreboardTheme,
} from '@/features/scoreboard/scoreboard-view-model';
import { AthletePanel } from '@/features/scoreboard/components/athlete-panel';
import { MatchIdSwitcher } from '@/features/scoreboard/components/match-id-switcher';
import { ScoreboardClock } from '@/features/scoreboard/components/scoreboard-clock';
import { WinnerPresentation } from '@/features/scoreboard/components/winner-presentation';
import { useFullscreen, useScreenWakeLock } from '@/features/scoreboard/display-controls';

const THEME_BACKGROUND: Record<ScoreboardTheme, string> = {
  arena: 'arena-background',
  attention: 'bg-gradient-to-br from-amber-950 via-yellow-800 to-amber-950',
  'red-winner': 'bg-gradient-to-br from-red-500 via-red-700 to-red-950',
  'blue-winner': 'bg-gradient-to-br from-sky-500 via-blue-700 to-blue-950',
};

const CONNECTION_LABEL = {
  connected: 'ĐANG TRỰC TUYẾN',
  reconnecting: 'ĐANG KẾT NỐI LẠI',
  connecting: 'ĐANG KẾT NỐI',
} as const;

function MatchSelector() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const match = normalizeMatchId(value);
    if (match) void navigate(scoreboardPath(match));
  }
  return (
    <main className="arena-background grid min-h-dvh place-items-center p-4 text-white sm:p-6">
      <form
        className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl shadow-blue-950/30 backdrop-blur-xl sm:p-8"
        onSubmit={submit}
      >
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
          Đấu Võ trực tiếp
        </p>
        <h1 className="mt-3 text-3xl font-black">Bảng điểm</h1>
        <p className="mt-2 text-sm text-sky-100/80">
          Nhập mã trận đấu để hiển thị bảng điểm trực tiếp.
        </p>
        <label className="mt-6 block text-sm font-bold" htmlFor="scoreboard-match">
          Mã trận đấu
        </label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
          className="mt-2 h-14 w-full rounded-xl border border-white/50 bg-white/95 px-4 font-mono text-xl font-bold uppercase tracking-[0.12em] text-blue-950 outline-none transition placeholder:normal-case placeholder:tracking-normal focus:border-sky-300 focus:ring-4 focus:ring-sky-300/20"
          enterKeyHint="go"
          id="scoreboard-match"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          placeholder="VD: A72K9P"
          required
          spellCheck={false}
          value={value}
        />
        <button
          className="mt-4 h-14 w-full rounded-xl bg-gradient-to-r from-sky-700 to-blue-800 font-black text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-800 hover:to-blue-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40 disabled:opacity-60"
          disabled={!value.trim()}
          type="submit"
        >
          MỞ BẢNG ĐIỂM
        </button>
      </form>
    </main>
  );
}

export function ScoreboardPage() {
  const { matchId: pathMatchId } = useParams<{ matchId: string }>();
  const [params] = useSearchParams();
  const matchPublicId = normalizeMatchId(pathMatchId ?? params.get('match') ?? '');
  if (!matchPublicId) return <MatchSelector />;
  return <ScoreboardContent matchPublicId={matchPublicId} />;
}

function ConnectionBadge({
  status,
  hasSnapshot,
}: {
  readonly status: ScoreboardConnectionStatus;
  readonly hasSnapshot: boolean;
}) {
  const state = status === 'connected' ? 'connected' : hasSnapshot ? 'reconnecting' : 'connecting';
  return (
    <p
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[clamp(0.6875rem,1.8vmin,1rem)] font-bold',
        state === 'connected'
          ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-200'
          : 'border-amber-200/40 bg-amber-500/15 text-amber-100',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          state === 'connected' ? 'bg-emerald-300' : 'animate-pulse bg-amber-200',
        )}
      />
      {CONNECTION_LABEL[state]}
    </p>
  );
}

function FullscreenButton() {
  const fullscreen = useFullscreen();
  if (!fullscreen.supported) return null;
  const Icon = fullscreen.active ? Minimize : Maximize;
  const label = fullscreen.active ? 'Thoát toàn màn hình' : 'Toàn màn hình';
  return (
    <button
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white/90 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50"
      onClick={fullscreen.toggle}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={2.5} />
    </button>
  );
}

function ScoreboardContent({ matchPublicId }: { readonly matchPublicId: string }) {
  const { connectionStatus, snapshot } = useScoreboardRealtime(matchPublicId);
  const location = useLocation();
  const navigate = useNavigate();
  const invalidMatchHandled = useRef(false);
  const previousMatchId = (location.state as { previousMatchId?: string } | null)?.previousMatchId;
  useScreenWakeLock();

  useEffect(() => {
    invalidMatchHandled.current = false;
  }, [matchPublicId]);

  useEffect(() => {
    if (
      previousMatchId &&
      connectionStatus === 'disconnected' &&
      snapshot === null &&
      !invalidMatchHandled.current
    ) {
      invalidMatchHandled.current = true;
      toast({ title: 'Mã trận đấu không chính xác', variant: 'destructive' });
      void navigate(scoreboardPath(previousMatchId), { replace: true });
    }
  }, [connectionStatus, navigate, previousMatchId, snapshot]);

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
        'flex min-h-dvh flex-col gap-[clamp(0.5rem,1.6vmin,1.25rem)] p-[clamp(0.5rem,1.6vmin,1.25rem)] text-white transition-colors duration-500',
        THEME_BACKGROUND[view.theme],
      )}
    >
      <header
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border px-3 py-2 backdrop-blur sm:px-5',
          attention ? 'border-amber-200/40 bg-amber-950/45' : 'border-white/10 bg-blue-950/25',
        )}
      >
        <MatchIdSwitcher
          displayId={snapshot?.match.publicId ?? matchPublicId}
          key={matchPublicId}
          matchPublicId={matchPublicId}
          onSwitch={(nextMatchId) => {
            void navigate(scoreboardPath(nextMatchId), {
              state: { previousMatchId: matchPublicId },
            });
          }}
        />
        <div className="flex items-center gap-2">
          <ConnectionBadge hasSnapshot={snapshot !== null} status={connectionStatus} />
          <FullscreenButton />
        </div>
      </header>

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
