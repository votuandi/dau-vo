import { useEffect } from 'react';
import { Medal, Trophy, X } from 'lucide-react';
import type {
  TournamentPodiumAthlete,
  TournamentResultsAnnouncedPayload,
} from '@martial-arts-scoring/shared-types';
import { cn } from '@/lib/utils';
import { SponsorLogo } from '@/features/tournament-watch/watch-sponsor-strip';
import type { PublicSponsor } from '@/services/api/watch';
import { FireworksCanvas } from './fireworks-canvas';
import { ScoreboardImage } from './scoreboard-image';

type Place = 1 | 2 | 3;

const PLACE = {
  1: {
    label: 'Hạng nhất',
    step: 'h-[clamp(7rem,24vh,15rem)] from-amber-300 via-yellow-400 to-amber-600 text-amber-950',
    ring: 'ring-amber-300',
    medal: 'text-amber-300',
  },
  2: {
    label: 'Hạng nhì',
    step: 'h-[clamp(5rem,16vh,10rem)] from-slate-100 via-slate-300 to-slate-500 text-slate-900',
    ring: 'ring-slate-200',
    medal: 'text-slate-200',
  },
  3: {
    label: 'Hạng ba',
    step: 'h-[clamp(3.5rem,10vh,6.5rem)] from-orange-300 via-amber-600 to-orange-800 text-orange-50',
    ring: 'ring-orange-400',
    medal: 'text-orange-400',
  },
} as const;

function PodiumAthlete({
  athlete,
  place,
}: {
  readonly athlete: TournamentPodiumAthlete;
  readonly place: Place;
}) {
  const champion = place === 1;
  return (
    <figure className="flex min-w-0 flex-col items-center text-center">
      {champion ? (
        <Trophy
          aria-hidden="true"
          className="mb-[clamp(0.25rem,1vh,0.75rem)] size-[clamp(3rem,11vh,7rem)] text-amber-300 drop-shadow-[0_0_24px_rgba(252,211,77,0.75)]"
          strokeWidth={1.6}
        />
      ) : (
        <Medal
          aria-hidden="true"
          className={cn('mb-1 size-[clamp(1.75rem,5vh,3rem)]', PLACE[place].medal)}
        />
      )}
      <ScoreboardImage
        alt={athlete.name}
        className={cn(
          'ring-4',
          PLACE[place].ring,
          champion ? 'size-[clamp(5rem,17vh,10rem)]' : 'size-[clamp(3.75rem,12vh,7rem)]',
        )}
        imagePath={athlete.imagePath}
        kind="athlete"
      />
      <figcaption className="mt-[clamp(0.25rem,1vh,0.75rem)] w-full min-w-0">
        <p
          className={cn(
            'line-clamp-2 font-black leading-tight text-white',
            champion ? 'text-[clamp(1.25rem,3.4vh,2.5rem)]' : 'text-[clamp(1rem,2.5vh,1.75rem)]',
          )}
        >
          {athlete.name}
        </p>
        <p className="line-clamp-2 text-[clamp(0.8rem,1.8vh,1.25rem)] font-semibold text-sky-100/85">
          {athlete.organization ?? 'Chưa cập nhật đơn vị'}
        </p>
      </figcaption>
    </figure>
  );
}

/** One podium column: the athletes standing on it, then the step with its rank. */
function PodiumColumn({
  athletes,
  place,
}: {
  readonly athletes: readonly TournamentPodiumAthlete[];
  readonly place: Place;
}) {
  if (athletes.length === 0) return null;
  return (
    <li
      aria-label={`${PLACE[place].label}: ${athletes.map((athlete) => athlete.name).join(', ')}`}
      className={cn(
        'flex min-w-0 flex-col justify-end',
        place === 1 ? 'w-[clamp(11rem,30vw,22rem)]' : 'w-[clamp(9rem,24vw,18rem)]',
        athletes.length > 1 && 'w-[clamp(14rem,36vw,30rem)]',
      )}
    >
      <div className="flex items-end justify-center gap-[clamp(0.5rem,1.5vw,1.5rem)] px-1 pb-[clamp(0.5rem,1.5vh,1rem)]">
        {athletes.map((athlete, index) => (
          <PodiumAthlete athlete={athlete} key={`${athlete.name}-${String(index)}`} place={place} />
        ))}
      </div>
      <div
        className={cn(
          'grid place-items-center rounded-t-2xl bg-gradient-to-b shadow-[0_-8px_40px_rgba(0,0,0,0.35)]',
          PLACE[place].step,
        )}
      >
        <span aria-hidden="true" className="text-[clamp(2rem,7vh,5rem)] font-black leading-none">
          {place}
        </span>
      </div>
    </li>
  );
}

/**
 * "Kết quả giải đấu": the podium of one weight class, shown on every scoreboard
 * after a supervisor announces it. Second stands left of the champion, the two
 * joint thirds share the lowest step on the right.
 */
export function TournamentResultsScreen({
  results,
  sponsors,
  onClose,
}: {
  readonly results: TournamentResultsAnnouncedPayload;
  readonly sponsors: readonly PublicSponsor[];
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const { podium } = results;
  return (
    <section
      aria-label={`Kết quả giải đấu hạng cân ${results.weightClass.name}`}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,#1e3a8a_0%,#0b1437_55%,#020617_100%)] text-white"
      role="dialog"
    >
      <FireworksCanvas className="pointer-events-none absolute inset-0 size-full" />

      <header className="relative z-10 flex items-start justify-between gap-4 p-[clamp(0.75rem,2.5vmin,2rem)]">
        <div className="flex min-w-0 items-center gap-3">
          {results.tournament.imagePath ? (
            <ScoreboardImage
              alt={`Logo ${results.tournament.name}`}
              imagePath={results.tournament.imagePath}
              kind="organization"
            />
          ) : null}
          <div className="min-w-0">
            <p className="line-clamp-2 text-[clamp(1rem,3vmin,2rem)] font-black leading-tight">
              {results.tournament.name}
            </p>
            <p className="text-[clamp(0.9rem,2.4vmin,1.5rem)] font-bold text-amber-300">
              Hạng cân {results.weightClass.name}
            </p>
          </div>
        </div>
        {sponsors.length > 0 ? (
          <ul
            aria-label="Nhà tài trợ"
            className="flex max-w-[45%] flex-wrap justify-end gap-[clamp(0.25rem,1vmin,0.75rem)]"
          >
            {sponsors.map((sponsor) => (
              <li
                className="grid h-[clamp(2.25rem,6vmin,4rem)] w-[clamp(4.5rem,12vmin,8rem)] place-items-center rounded-lg bg-white/95 p-1.5 shadow-lg"
                key={sponsor.id}
                title={sponsor.name}
              >
                <SponsorLogo sponsor={sponsor} />
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <h1 className="relative z-10 text-center text-[clamp(1.5rem,5vmin,3.75rem)] font-black uppercase tracking-[0.08em] text-amber-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
        Kết quả giải đấu
      </h1>

      <ol className="relative z-10 mx-auto mt-auto flex w-full max-w-7xl items-end justify-center gap-[clamp(0.25rem,1vw,1rem)] px-[clamp(0.5rem,2vw,2rem)]">
        {podium.second ? <PodiumColumn athletes={[podium.second]} place={2} /> : null}
        <PodiumColumn athletes={[podium.first]} place={1} />
        <PodiumColumn athletes={podium.thirds} place={3} />
      </ol>

      <button
        aria-label="Đóng màn hình kết quả giải đấu"
        className="absolute bottom-3 right-3 z-20 grid size-10 place-items-center rounded-full border border-white/20 bg-black/30 text-white/70 transition hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50"
        onClick={onClose}
        title="Đóng"
        type="button"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    </section>
  );
}
