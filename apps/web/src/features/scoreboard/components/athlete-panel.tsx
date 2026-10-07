import { memo } from 'react';
import { AthleteColor } from '@martial-arts-scoring/shared-types';
import { cn } from '@/lib/utils';
import type { ScoreboardAthlete } from '../scoreboard-view-model';
import { ScoreboardImage } from './scoreboard-image';

function FaultChip({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-white/15 bg-black/20 px-2.5 py-1 backdrop-blur">
      <span className="text-white/80">{label}</span>
      <span className="font-mono font-black tabular-nums">{value}</span>
    </span>
  );
}

export const AthletePanel = memo(function AthletePanel({
  athlete,
}: {
  readonly athlete: ScoreboardAthlete;
}) {
  const red = athlete.color === AthleteColor.RED;
  const organization = athlete.organization ?? 'VĐV tự do';

  return (
    <section
      aria-label={red ? 'Góc Đỏ' : 'Góc Xanh'}
      className={cn(
        'flex min-w-0 flex-col gap-[clamp(0.5rem,1.8vmin,1.25rem)] rounded-[clamp(1rem,3vmin,2rem)] border-4 p-[clamp(0.75rem,2.4vmin,1.75rem)] shadow-2xl short:grid short:grid-cols-[minmax(0,1fr)_auto] short:items-center',
        red
          ? 'border-red-300/80 bg-gradient-to-br from-red-600 via-red-700 to-red-950 shadow-red-950/30'
          : 'border-sky-300/80 bg-gradient-to-br from-sky-700 via-blue-800 to-blue-950 shadow-blue-950/30',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 short:col-start-1">
        <p
          className={cn(
            'text-[clamp(0.75rem,2.2vmin,1.25rem)] font-black tracking-[0.24em]',
            red ? 'text-red-100' : 'text-sky-100',
          )}
        >
          {red ? 'ĐỎ · RED' : 'XANH · BLUE'}
        </p>
        <div
          aria-label={`Lỗi nhẹ: ${String(athlete.faultCounts.minor)} · Lỗi nặng: ${String(athlete.faultCounts.major)}`}
          className="flex flex-wrap gap-1.5 text-[clamp(0.75rem,2vmin,1.25rem)] font-bold"
          role="group"
        >
          <FaultChip label="Lỗi nhẹ" value={athlete.faultCounts.minor} />
          <FaultChip label="Lỗi nặng" value={athlete.faultCounts.major} />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-[clamp(0.75rem,2.4vmin,1.5rem)] short:col-start-1">
        <ScoreboardImage
          alt={`Ảnh của ${athlete.name}`}
          imagePath={athlete.athleteImagePath}
          kind="athlete"
        />
        <div className="min-w-0 flex-1">
          <h2
            className="line-clamp-3 text-balance break-words text-[clamp(1.125rem,4.4vmin,4.25rem)] font-black leading-[1.1]"
            title={athlete.name}
          >
            {athlete.name}
          </h2>
          <div className="mt-[clamp(0.25rem,1vmin,0.75rem)] flex min-w-0 items-center gap-2 text-[clamp(0.875rem,2.6vmin,1.75rem)] text-white/90">
            <ScoreboardImage
              alt={`Logo ${organization}`}
              imagePath={athlete.organizationImagePath}
              kind="organization"
            />
            <p className="truncate" title={organization}>
              {organization}
            </p>
          </div>
        </div>
      </div>

      <div className="grid flex-1 place-items-center short:col-start-2 short:row-span-2 short:row-start-1 short:pl-2">
        <p
          aria-label={`Điểm ${red ? 'Đỏ' : 'Xanh'}: ${String(athlete.score)}`}
          className="font-mono text-[clamp(3.5rem,21vmin,15rem)] font-black leading-none tabular-nums drop-shadow-[0_6px_24px_rgb(0_0_0/0.35)]"
        >
          {athlete.score}
        </p>
      </div>
    </section>
  );
});
