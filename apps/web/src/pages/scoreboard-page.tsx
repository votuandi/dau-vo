import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ArrowRightLeft, Save, X } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AthleteColor,
  MatchLifecycle,
  MatchStatus,
  type PublicMatchStatePayload,
} from '@martial-arts-scoring/shared-types';
import { useScoreboardRealtime } from '@/features/scoreboard/scoreboard-realtime';
import { IntermissionCountdown, useIntermissionActive } from '@/components/intermission-countdown';
import { tournamentImageUrl } from '@/components/tournament-image';
import { toast } from '@/components/ui/toast';
import {
  isPausedPhase,
  isRunningPhase,
  presentLifecycle,
  presentPhase,
} from '@/features/match-presentation';

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function useDisplayTimer(
  endsAt: string | undefined,
  generatedAt: string | undefined,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);

  useEffect(() => {
    const localNow = Date.now();
    const serverNow = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    offsetRef.current = Number.isNaN(serverNow) ? 0 : serverNow - localNow;
    setNow(localNow);
    if (!endsAt) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, [endsAt, generatedAt]);

  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  return Number.isNaN(end) ? null : Math.max(0, end - (now + offsetRef.current));
}

function AthletePanel({
  athlete,
}: {
  readonly athlete: {
    color: AthleteColor;
    name: string;
    organization: string | null;
    athleteImagePath: string | null;
    organizationImagePath: string | null;
    score: number;
    violations: number;
    faultCounts: { minor: number; major: number };
  };
}) {
  const red = athlete.color === AthleteColor.RED;
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-[1.5rem] border-4 p-4 shadow-2xl sm:rounded-[2rem] sm:p-6 ${
        red
          ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30'
          : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30'
      }`}
    >
      <div className="min-w-0">
        <p
          className={`text-xs font-black tracking-[0.2em] sm:text-lg sm:tracking-[0.28em] ${red ? 'text-red-100' : 'text-sky-100'}`}
        >
          {red ? 'ĐỎ · RED' : 'XANH · BLUE'}
        </p>
        <div className="mt-3 flex min-w-0 items-center gap-3 sm:mt-5 sm:gap-5">
          <ScoreboardImage
            alt={`Ảnh của ${athlete.name}`}
            imagePath={athlete.athleteImagePath}
            kind="athlete"
          />
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-black leading-tight sm:text-5xl lg:text-6xl">
              {athlete.name}
            </h2>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-white/90 sm:mt-3 sm:text-2xl">
              <ScoreboardImage
                alt={`Logo ${athlete.organization ?? 'tổ chức'}`}
                imagePath={athlete.organizationImagePath}
                kind="organization"
              />
              <p className="truncate">{athlete.organization ?? 'VĐV tự do'}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 sm:mt-8 sm:gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-white/90 sm:text-lg">
            Điểm
          </p>
          <p className="mt-1 font-mono text-6xl font-black leading-none tabular-nums sm:text-8xl lg:text-[min(22vh,11rem)]">
            {athlete.score}
          </p>
        </div>
        <p className="rounded-xl border border-white/15 bg-white/10 px-2 py-2 text-xs font-bold backdrop-blur sm:px-4 sm:py-3 sm:text-lg lg:text-2xl">
          Lỗi nhẹ: {athlete.faultCounts.minor} · Lỗi nặng: {athlete.faultCounts.major}
        </p>
      </div>
    </section>
  );
}

function ScoreboardImage({
  alt,
  imagePath,
  kind,
}: {
  readonly alt: string;
  readonly imagePath: string | null;
  readonly kind: 'athlete' | 'organization';
}) {
  const [failed, setFailed] = useState(false);
  const src = imagePath ? tournamentImageUrl(imagePath) : null;
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const classes =
    kind === 'athlete'
      ? 'size-16 shrink-0 rounded-full sm:size-24 lg:size-[min(18vh,9rem)]'
      : 'size-7 shrink-0 rounded-md sm:size-10';
  return src && !failed ? (
    <img
      alt={alt}
      className={`${classes} border-2 border-white/40 bg-white/10 object-cover`}
      onError={() => {
        setFailed(true);
      }}
      src={src}
    />
  ) : (
    <div
      aria-label={
        kind === 'athlete'
          ? `Chưa có ảnh của ${alt.replace('Ảnh của ', '')}`
          : `Chưa có ${alt.toLowerCase()}`
      }
      className={`${classes} grid place-items-center border border-dashed border-white/50 bg-white/10 text-xs font-black`}
      role="img"
    >
      {kind === 'athlete' ? 'VÕ' : 'CLB'}
    </div>
  );
}

function WinnerPresentation({
  athlete,
}: {
  readonly athlete: PublicMatchStatePayload['athletes'][number];
}) {
  const red = athlete.color === AthleteColor.RED;
  return (
    <section
      aria-label="Kết quả đã công bố"
      className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 text-center sm:px-8"
    >
      <p className="text-sm font-black uppercase tracking-[0.24em] text-white/80 sm:text-xl">
        Người chiến thắng
      </p>
      <div className="mt-4">
        <ScoreboardImage
          alt={`Ảnh của ${athlete.name}`}
          imagePath={athlete.athleteImagePath}
          kind="athlete"
        />
      </div>
      <h1 className="mt-4 max-w-5xl break-words text-4xl font-black leading-tight sm:text-6xl lg:text-[min(11vw,8rem)]">
        {athlete.name}
      </h1>
      <div className="mt-4 flex min-w-0 items-center gap-3 text-lg text-white/90 sm:text-3xl">
        <ScoreboardImage
          alt={`Logo ${athlete.organization ?? 'tổ chức'}`}
          imagePath={athlete.organizationImagePath}
          kind="organization"
        />
        <span className="truncate">{athlete.organization ?? 'VĐV tự do'}</span>
      </div>
      <p className="mt-5 rounded-full border border-white/30 bg-black/15 px-4 py-2 text-sm font-black tracking-[0.18em] sm:text-xl">
        {red ? 'ĐỎ · RED' : 'XANH · BLUE'}
      </p>
    </section>
  );
}

function roundLabel(
  round:
    | { stage: 'REGULATION' | 'OVERTIME'; roundNumber: number; attemptNumber: number }
    | null
    | undefined,
): string | null {
  if (!round) return null;
  return round.stage === 'OVERTIME'
    ? `HIỆP PHỤ LẦN ${String(round.attemptNumber)}`
    : `HIỆP ${String(round.roundNumber)}`;
}

function MatchSelector() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const match = value.trim().toUpperCase();
    if (match) void navigate(`/bang-diem?match=${encodeURIComponent(match)}`);
  }
  return (
    <main className="arena-background grid min-h-dvh place-items-center p-6 text-white">
      <form
        className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl shadow-blue-950/30 backdrop-blur-xl"
        onSubmit={submit}
      >
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-200">
          Đấu Võ trực tiếp
        </p>
        <h1 className="mt-3 text-3xl font-black">Bảng điểm</h1>
        <label className="mt-6 block text-sm font-bold" htmlFor="scoreboard-match">
          Mã trận đấu
        </label>
        <input
          autoFocus
          className="mt-2 h-14 w-full rounded-xl border border-white/50 bg-white/95 px-4 font-mono text-xl font-bold text-blue-950 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-300/20"
          id="scoreboard-match"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          value={value}
        />
        <button
          className="mt-4 h-14 w-full rounded-xl bg-gradient-to-r from-sky-700 to-blue-800 font-black text-white shadow-lg shadow-blue-950/30 transition hover:from-sky-800 hover:to-blue-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40"
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
  const matchPublicId = (pathMatchId ?? params.get('match') ?? '').trim().toUpperCase();
  if (!matchPublicId) return <MatchSelector />;
  return <ScoreboardContent matchPublicId={matchPublicId} />;
}

function ScoreboardContent({ matchPublicId }: { readonly matchPublicId: string }) {
  const { connectionStatus, snapshot } = useScoreboardRealtime(matchPublicId);
  const location = useLocation();
  const navigate = useNavigate();
  const invalidMatchHandled = useRef(false);
  const [editingMatchId, setEditingMatchId] = useState(false);
  const [matchIdDraft, setMatchIdDraft] = useState(matchPublicId);
  const previousMatchId = (location.state as { previousMatchId?: string } | null)?.previousMatchId;

  useEffect(() => {
    setEditingMatchId(false);
    setMatchIdDraft(matchPublicId);
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
      void navigate(`/bang-diem?match=${encodeURIComponent(previousMatchId)}`, { replace: true });
    }
  }, [connectionStatus, navigate, previousMatchId, snapshot]);

  function submitMatchId(): void {
    const nextMatchId = matchIdDraft.trim().toUpperCase();
    if (nextMatchId === matchPublicId) {
      toast({ title: 'Đây là mã trận đấu cũ', variant: 'destructive' });
      return;
    }
    if (!nextMatchId) {
      toast({ title: 'Mã trận đấu không chính xác', variant: 'destructive' });
      return;
    }
    void navigate(`/bang-diem?match=${encodeURIComponent(nextMatchId)}`, {
      state: { previousMatchId: matchPublicId },
    });
  }
  const activeRound = snapshot?.activeRound;
  const running = isRunningPhase(snapshot?.match.phase);
  const paused = isPausedPhase(snapshot?.match.phase);
  const presentation = snapshot
    ? snapshot.match.lifecycle === MatchLifecycle.SUSPENDED
      ? presentLifecycle(snapshot.match.lifecycle)
      : presentPhase(snapshot.match.phase)
    : null;
  const remaining = useDisplayTimer(
    running ? activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const red = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blue = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);
  const winner = snapshot?.match.outcome?.winner;
  const winnerAthlete = winner
    ? snapshot.athletes.find((athlete) => athlete.color === winner)
    : null;
  const outcomeMethod = snapshot?.match.outcome?.method;
  const committedScores = snapshot?.committedScores;
  const intermission = useIntermissionActive(
    snapshot?.match.phase === MatchStatus.BREAK ? snapshot.intermissionEndsAt : null,
    snapshot?.generatedAt,
  );
  const appealActive =
    snapshot?.match.phase === MatchStatus.REGULATION_APPEAL ||
    snapshot?.match.phase === MatchStatus.OVERTIME_APPEAL;
  const yellowPresentation = paused || intermission.active || appealActive;
  const publishedWinner = winnerAthlete ?? null;

  return (
    <main
      className={`flex h-screen h-dvh flex-col overflow-hidden p-3 text-white sm:p-5 ${publishedWinner ? (publishedWinner.color === AthleteColor.RED ? 'bg-gradient-to-br from-red-500 via-red-700 to-red-950' : 'bg-gradient-to-br from-sky-500 via-blue-700 to-blue-950') : yellowPresentation ? 'bg-gradient-to-br from-amber-950 via-yellow-800 to-amber-950' : 'arena-background'}`}
    >
      <header
        className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 backdrop-blur sm:px-6 ${yellowPresentation ? 'border-amber-200/40 bg-amber-950/45' : 'border-white/10 bg-blue-950/25'}`}
      >
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {editingMatchId ? (
            <input
              aria-label="Mã trận đấu"
              autoFocus
              className="h-11 min-w-0 max-w-44 rounded-lg border border-sky-200/70 bg-white px-3 font-mono text-lg font-black tracking-[0.12em] text-blue-950 outline-none transition focus:ring-4 focus:ring-sky-300 sm:h-14 sm:max-w-xs sm:text-3xl"
              onChange={(event) => {
                setMatchIdDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitMatchId();
              }}
              value={matchIdDraft}
            />
          ) : (
            <p className="truncate font-mono text-2xl font-black tracking-[0.2em] sm:text-4xl">
              {snapshot?.match.publicId ?? matchPublicId}
            </p>
          )}
          <button
            aria-label={editingMatchId ? 'Lưu mã trận đấu' : 'Chuyển đổi mã trận đấu'}
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-sky-200/50 bg-sky-500/20 text-sky-100 shadow-lg shadow-blue-950/20 transition hover:bg-sky-400/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50 sm:size-14"
            onClick={() => {
              if (editingMatchId) submitMatchId();
              else setEditingMatchId(true);
            }}
            type="button"
          >
            {editingMatchId ? (
              <Save aria-hidden="true" className="size-5 sm:size-6" strokeWidth={2.5} />
            ) : (
              <ArrowRightLeft aria-hidden="true" className="size-5 sm:size-6" strokeWidth={2.5} />
            )}
          </button>
          {editingMatchId ? (
            <button
              aria-label="Hủy chỉnh sửa mã trận đấu"
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-rose-200/50 bg-rose-500/20 text-rose-100 shadow-lg shadow-rose-950/20 transition hover:bg-rose-400/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-300/50 sm:size-14"
              onClick={() => {
                setMatchIdDraft(matchPublicId);
                setEditingMatchId(false);
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-5 sm:size-6" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
        <p
          className={`text-sm font-bold sm:text-lg ${connectionStatus === 'connected' ? 'text-emerald-300' : 'text-amber-200'}`}
        >
          {connectionStatus === 'connected'
            ? 'ĐANG TRỰC TUYẾN'
            : snapshot
              ? 'ĐANG KẾT NỐI LẠI'
              : 'ĐANG KẾT NỐI'}
        </p>
      </header>
      {publishedWinner ? (
        <WinnerPresentation athlete={publishedWinner} />
      ) : (
        <>
          <section
            className={`my-4 rounded-[2rem] border px-6 py-5 text-center shadow-2xl backdrop-blur-xl sm:my-7 ${yellowPresentation ? 'border-amber-200/40 bg-amber-950/30 shadow-amber-950/30' : 'border-white/15 bg-white/10 shadow-blue-950/20'}`}
          >
            <p className="text-2xl font-black tracking-[0.2em] text-sky-100 sm:text-4xl">
              {presentation?.label ?? 'ĐANG KẾT NỐI'}
            </p>
            {roundLabel(activeRound) ? (
              <p className="mt-2 text-base font-black tracking-[0.12em] text-amber-200 sm:text-xl">
                {roundLabel(activeRound)}
              </p>
            ) : null}
            {presentation ? (
              <p className="mt-2 text-sm text-sky-100/85">{presentation.help}</p>
            ) : null}
            <p className="mt-2 font-mono text-7xl font-black tabular-nums sm:text-9xl">
              {running && remaining !== null
                ? formatRemaining(remaining)
                : paused && activeRound?.remainingDurationMs != null
                  ? formatRemaining(activeRound.remainingDurationMs)
                  : '--:--'}
            </p>
            <IntermissionCountdown
              endsAt={
                snapshot?.match.phase === MatchStatus.BREAK ? snapshot.intermissionEndsAt : null
              }
              generatedAt={snapshot?.generatedAt}
            />
          </section>
          <section
            className={`mb-4 rounded-2xl border px-6 py-4 text-center font-bold backdrop-blur sm:mb-7 ${
              winnerAthlete
                ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-100'
                : 'border-amber-200/30 bg-amber-100/10 text-amber-100'
            }`}
          >
            {winnerAthlete ? (
              <>
                <p className="text-sm uppercase tracking-[0.18em]">Người chiến thắng</p>
                <p className="mt-1 text-2xl font-black sm:text-4xl">{winnerAthlete.name}</p>
                {outcomeMethod === 'MANUAL_AFTER_OVERTIME_TIE' ? (
                  <p className="mt-2 text-sm">Quyết định giám sát sau hiệp phụ</p>
                ) : null}
              </>
            ) : (
              <p>Chưa công bố kết quả — chưa có người chiến thắng được xác nhận.</p>
            )}
            {committedScores?.RED != null && committedScores.BLUE != null ? (
              <p className="mt-2 text-sm opacity-90">
                {committedScores.source === 'OVERTIME'
                  ? `Điểm hiệp phụ lần ${String(committedScores.attemptNumber)}: Đỏ ${String(committedScores.RED)} · Xanh ${String(committedScores.BLUE)}`
                  : `Điểm chung cuộc sau 2 hiệp: Đỏ ${String(committedScores.RED)} · Xanh ${String(committedScores.BLUE)}`}
              </p>
            ) : null}
          </section>
          <section className="grid min-h-0 flex-1 gap-3 sm:gap-5 md:grid-cols-2">
            <AthletePanel
              athlete={
                red ?? {
                  color: AthleteColor.RED,
                  name: 'Võ sĩ Đỏ',
                  organization: 'Đang tải…',
                  athleteImagePath: null,
                  organizationImagePath: null,
                  score: 0,
                  violations: 0,
                  faultCounts: { minor: 0, major: 0 },
                }
              }
            />
            <AthletePanel
              athlete={
                blue ?? {
                  color: AthleteColor.BLUE,
                  name: 'Võ sĩ Xanh',
                  organization: 'Đang tải…',
                  athleteImagePath: null,
                  organizationImagePath: null,
                  score: 0,
                  violations: 0,
                  faultCounts: { minor: 0, major: 0 },
                }
              }
            />
          </section>
        </>
      )}
    </main>
  );
}
