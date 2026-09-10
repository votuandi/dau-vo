import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AthleteColor, MatchStatus } from '@martial-arts-scoring/shared-types';
import { useScoreboardRealtime } from '@/features/scoreboard/scoreboard-realtime';

function phaseLabel(status: MatchStatus | undefined): string {
  switch (status) {
    case MatchStatus.ROUND_1_RUNNING:
      return 'HIỆP 1';
    case MatchStatus.ROUND_1_PAUSED:
      return 'HIỆP 1 · PAUSED';
    case MatchStatus.ROUND_2_RUNNING:
      return 'HIỆP 2';
    case MatchStatus.ROUND_2_PAUSED:
      return 'HIỆP 2 · PAUSED';
    case MatchStatus.BREAK:
      return 'GIẢI LAO';
    case MatchStatus.FINISHED:
      return 'TRẬN ĐẤU ĐÃ KẾT THÚC';
    case MatchStatus.WAITING:
      return 'CHỜ BẮT ĐẦU';
    default:
      return 'ĐANG KẾT NỐI';
  }
}

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
    organization: string;
    score: number;
    violations: number;
  };
}) {
  const red = athlete.color === AthleteColor.RED;
  return (
    <section
      className={`flex min-h-0 flex-1 flex-col justify-between rounded-[2rem] border-4 p-6 shadow-2xl sm:p-10 ${
        red
          ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30'
          : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30'
      }`}
    >
      <div>
        <p
          className={`text-lg font-black tracking-[0.28em] ${red ? 'text-red-100' : 'text-sky-100'}`}
        >
          {red ? 'RED' : 'BLUE'}
        </p>
        <h2 className="mt-5 break-words text-4xl font-black leading-tight sm:text-6xl">
          {athlete.name}
        </h2>
        <p className="mt-3 text-xl text-white/90 sm:text-3xl">{athlete.organization}</p>
      </div>
      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-white/90 sm:text-lg">
            Điểm
          </p>
          <p className="mt-1 font-mono text-8xl font-black leading-none tabular-nums sm:text-[11rem]">
            {athlete.score}
          </p>
        </div>
        <p className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg font-bold backdrop-blur sm:text-2xl">
          Lỗi: {athlete.violations}
        </p>
      </div>
    </section>
  );
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
  const activeRound = snapshot?.activeRound;
  const running =
    snapshot?.match.status === MatchStatus.ROUND_1_RUNNING ||
    snapshot?.match.status === MatchStatus.ROUND_2_RUNNING;
  const paused =
    snapshot?.match.status === MatchStatus.ROUND_1_PAUSED ||
    snapshot?.match.status === MatchStatus.ROUND_2_PAUSED;
  const remaining = useDisplayTimer(
    running ? activeRound?.endsAt : undefined,
    snapshot?.generatedAt,
  );
  const red = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.RED);
  const blue = snapshot?.athletes.find((athlete) => athlete.color === AthleteColor.BLUE);

  return (
    <main className="arena-background min-h-dvh p-4 text-white sm:p-8">
      <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-blue-950/25 px-4 py-3 backdrop-blur sm:px-6">
        <p className="font-mono text-2xl font-black tracking-[0.2em] sm:text-4xl">
          {snapshot?.match.publicId ?? matchPublicId}
        </p>
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
      <section className="my-4 rounded-[2rem] border border-white/15 bg-white/10 px-6 py-5 text-center shadow-2xl shadow-blue-950/20 backdrop-blur-xl sm:my-7">
        <p className="text-2xl font-black tracking-[0.2em] text-sky-100 sm:text-4xl">
          {phaseLabel(snapshot?.match.status)}
        </p>
        <p className="mt-2 font-mono text-7xl font-black tabular-nums sm:text-9xl">
          {running && remaining !== null
            ? formatRemaining(remaining)
            : paused && activeRound?.remainingDurationMs != null
              ? formatRemaining(activeRound.remainingDurationMs)
              : '--:--'}
        </p>
      </section>
      <section className="grid min-h-[58vh] gap-4 sm:gap-7 md:grid-cols-2">
        <AthletePanel
          athlete={
            red ?? {
              color: AthleteColor.RED,
              name: 'Võ sĩ Đỏ',
              organization: 'Đang tải…',
              score: 0,
              violations: 0,
            }
          }
        />
        <AthletePanel
          athlete={
            blue ?? {
              color: AthleteColor.BLUE,
              name: 'Võ sĩ Xanh',
              organization: 'Đang tải…',
              score: 0,
              violations: 0,
            }
          }
        />
      </section>
    </main>
  );
}
