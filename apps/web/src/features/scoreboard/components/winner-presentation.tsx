import { Trophy } from 'lucide-react';
import { AthleteColor } from '@martial-arts-scoring/shared-types';
import type { ScoreboardAthlete } from '../scoreboard-view-model';
import { ScoreboardImage } from './scoreboard-image';

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
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,2.5vmin,1.75rem)] px-2 py-6 text-center sm:px-8"
    >
      <p className="inline-flex items-center gap-2 text-[clamp(0.875rem,2.6vmin,1.5rem)] font-black uppercase tracking-[0.24em] text-white/85">
        <Trophy aria-hidden="true" className="size-[1.4em] text-amber-200" strokeWidth={2.5} />
        Người chiến thắng
      </p>
      <ScoreboardImage
        alt={`Ảnh của ${athlete.name}`}
        imagePath={athlete.athleteImagePath}
        kind="athlete"
      />
      <h1 className="max-w-[min(100%,72rem)] text-balance break-words text-[clamp(2.25rem,10vmin,8rem)] font-black leading-[1.05]">
        {athlete.name}
      </h1>
      <div className="flex min-w-0 max-w-full items-center gap-3 text-[clamp(1rem,3.4vmin,2rem)] text-white/90">
        <ScoreboardImage
          alt={`Logo ${organization}`}
          imagePath={athlete.organizationImagePath}
          kind="organization"
        />
        <span className="truncate">{organization}</span>
      </div>
      <p className="rounded-full border border-white/30 bg-black/15 px-4 py-2 text-[clamp(0.875rem,2.4vmin,1.25rem)] font-black tracking-[0.18em]">
        {red ? 'ĐỎ · RED' : 'XANH · BLUE'}
      </p>
      {note ? <p className="text-[clamp(0.875rem,2.2vmin,1.25rem)] text-white/85">{note}</p> : null}
    </section>
  );
}
