import { useState } from 'react';
import { tournamentImageUrl } from '@/components/tournament-image';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  athlete: 'size-[clamp(4rem,17vmin,11rem)] rounded-full',
  organization: 'size-[clamp(2.25rem,7vmin,4.5rem)] rounded-[22%]',
} as const;

const IMAGE_CLASSES = {
  athlete: 'border-[3px] border-white/70 bg-white/10 object-cover shadow-xl shadow-black/30',
  // Logos are artwork: keep them whole on a light tile instead of cropping.
  // Padding is 8% of the tile size; a `%` padding would resolve against the
  // parent row's width and swallow the whole image on wide (fullscreen) screens.
  organization:
    'bg-white object-contain p-[clamp(0.18rem,0.56vmin,0.36rem)] shadow-lg shadow-black/25 ring-1 ring-black/5',
} as const;

function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return 'VÕ';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function ScoreboardImage({
  alt,
  className,
  imagePath,
  kind,
}: {
  readonly alt: string;
  readonly className?: string;
  readonly imagePath: string | null;
  readonly kind: 'athlete' | 'organization';
}) {
  const src = imagePath ? tournamentImageUrl(imagePath) : null;
  // Track which source failed so a new image path is retried automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const classes = cn('shrink-0', SIZE_CLASSES[kind], className);

  if (src && failedSrc !== src) {
    return (
      <img
        alt={alt}
        className={cn(IMAGE_CLASSES[kind], classes)}
        decoding="async"
        onError={() => {
          setFailedSrc(src);
        }}
        src={src}
      />
    );
  }

  const name = alt.replace('Ảnh của ', '');
  return (
    <div
      aria-label={kind === 'athlete' ? `Chưa có ảnh của ${name}` : `Chưa có ${alt.toLowerCase()}`}
      className={cn(
        'grid place-items-center border-2 border-dashed border-white/50 bg-white/10 font-black',
        classes,
      )}
      role="img"
    >
      {/* SVG text scales with the frame, so one placeholder fits every size. */}
      <svg aria-hidden="true" className="size-full" viewBox="0 0 100 100">
        <text
          dominantBaseline="central"
          fill="currentColor"
          fontSize={kind === 'athlete' ? 34 : 28}
          fontWeight={900}
          textAnchor="middle"
          x="50"
          y="52"
        >
          {kind === 'athlete' ? initials(name) : 'CLB'}
        </text>
      </svg>
    </div>
  );
}
