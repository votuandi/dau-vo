import type { CSSProperties } from 'react';
import { Trophy } from 'lucide-react';
import { AthleteColor } from '@martial-arts-scoring/shared-types';
import { cn } from '@/lib/utils';
import type { ScoreboardAthlete } from '../scoreboard-view-model';
import { ScoreboardImage } from './scoreboard-image';
import '@/styles/scoreboard.css';

const CONFETTI_COUNT = 48;
const SHARED_COLORS = ['#fde68a', '#fbbf24', '#ffffff'] as const;
const CORNER_COLORS = {
  [AthleteColor.RED]: ['#ef4444', '#fca5a5'],
  [AthleteColor.BLUE]: ['#38bdf8', '#93c5fd'],
} as const;

/** Deterministic pieces so every screen shows the same celebration. */
function confettiPieces(color: AthleteColor): readonly CSSProperties[] {
  const palette = [...SHARED_COLORS, ...CORNER_COLORS[color]];
  return Array.from({ length: CONFETTI_COUNT }, (_, index) => {
    const round = index % 3 === 0;
    return {
      '--x': `${String((index * 37 + 7) % 100)}%`,
      '--w': `${String(8 + (index % 4) * 2)}px`,
      '--h': round ? `${String(8 + (index % 4) * 2)}px` : `${String(14 + (index % 5) * 2)}px`,
      '--r': round ? '9999px' : '2px',
      '--color': palette[index % palette.length],
      '--delay': `${String(((index * 53) % 30) / 10 + 0.3)}s`,
      '--duration': `${String(3.2 + ((index * 29) % 20) / 10)}s`,
      '--drift': `${String(((index * 17) % 21) - 10)}vw`,
      '--spin': `${String(360 + ((index * 41) % 4) * 180)}deg`,
    } as CSSProperties;
  });
}

export function WinnerPresentation({
  athlete,
  note,
}: {
  readonly athlete: ScoreboardAthlete;
  readonly note: string | null;
}) {
  const red = athlete.color === AthleteColor.RED;
  const organization = athlete.organization ?? 'VĐV tự do';

  return (
    <section
      aria-label="Kết quả đã công bố"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(1.25rem,4vmin,3rem)] px-2 py-6 text-center sm:px-8 landscape:flex-row landscape:gap-[clamp(1.5rem,7vmin,6rem)] landscape:text-left"
    >
      <div
        aria-hidden="true"
        className="winner-flash pointer-events-none fixed inset-0 z-40 bg-white"
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
        {confettiPieces(athlete.color).map((style, index) => (
          <span className="winner-confetti" key={index} style={style} />
        ))}
      </div>

      <div className="winner-reveal-portrait relative isolate shrink-0">
        <div aria-hidden="true" className="winner-rays absolute -inset-[45%] -z-10 rounded-full" />
        <div className="winner-halo rounded-full">
          <ScoreboardImage
            alt={`Ảnh của ${athlete.name}`}
            className="block size-[clamp(9rem,min(66vw,40vh),26rem)] border-[clamp(4px,0.8vmin,8px)] border-white landscape:size-[clamp(8rem,min(40vw,60vh),32rem)]"
            imagePath={athlete.athleteImagePath}
            kind="athlete"
          />
        </div>
        {athlete.organizationImagePath ? (
          <div className="winner-reveal-badge absolute -bottom-[4%] -right-[6%] w-[40%]">
            <ScoreboardImage
              alt={`Logo ${organization}`}
              className="block aspect-square h-auto w-full rounded-[24%] ring-4 ring-amber-200"
              imagePath={athlete.organizationImagePath}
              kind="organization"
            />
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 max-w-full flex-col items-center gap-[clamp(0.75rem,2.4vmin,1.75rem)] landscape:max-w-[min(52vw,60rem)] landscape:items-start">
        <p className="winner-reveal-label inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-black/20 px-4 py-2 text-[clamp(0.875rem,2.8vmin,1.75rem)] font-black uppercase tracking-[0.24em] text-amber-100 backdrop-blur">
          <Trophy aria-hidden="true" className="size-[1.4em] text-amber-300" strokeWidth={2.5} />
          Người chiến thắng
        </p>
        <h1 className="winner-reveal-name max-w-full text-balance break-words text-[clamp(2.25rem,10vmin,8rem)] font-black leading-[1.05] drop-shadow-[0_6px_24px_rgb(0_0_0/0.35)]">
          {athlete.name}
        </h1>
        <div className="winner-reveal-meta flex min-w-0 max-w-full flex-col items-center gap-[clamp(0.5rem,1.8vmin,1.25rem)] landscape:items-start">
          <p className="line-clamp-2 max-w-full break-words text-[clamp(1.125rem,4vmin,2.5rem)] font-bold text-white/90">
            {organization}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 landscape:justify-start">
            <p
              className={cn(
                'rounded-full border-2 px-4 py-2 text-[clamp(0.875rem,2.4vmin,1.25rem)] font-black tracking-[0.18em]',
                red ? 'border-red-200/70 bg-red-950/30' : 'border-sky-200/70 bg-blue-950/30',
              )}
            >
              {red ? 'ĐỎ · RED' : 'XANH · BLUE'}
            </p>
            {note ? (
              <p className="text-[clamp(0.875rem,2.2vmin,1.25rem)] text-white/85">{note}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
