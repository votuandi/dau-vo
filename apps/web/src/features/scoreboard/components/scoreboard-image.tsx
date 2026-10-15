import { useState } from 'react';
import { tournamentImageUrl } from '@/components/tournament-image';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  athlete: 'size-[clamp(3rem,11vmin,8rem)] rounded-full',
  organization: 'size-[clamp(1.5rem,4.5vmin,2.75rem)] rounded-md',
} as const;

export function ScoreboardImage({
  alt,
  imagePath,
  kind,
}: {
  readonly alt: string;
  readonly imagePath: string | null;
  readonly kind: 'athlete' | 'organization';
}) {
  const src = imagePath ? tournamentImageUrl(imagePath) : null;
  // Track which source failed so a new image path is retried automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const classes = cn('shrink-0', SIZE_CLASSES[kind]);

  if (src && failedSrc !== src) {
    return (
      <img
        alt={alt}
        className={cn(classes, 'border-2 border-white/40 bg-white/10 object-cover')}
        decoding="async"
        onError={() => {
          setFailedSrc(src);
        }}
        src={src}
      />
    );
  }

  return (
    <div
      aria-label={
        kind === 'athlete'
          ? `Chưa có ảnh của ${alt.replace('Ảnh của ', '')}`
          : `Chưa có ${alt.toLowerCase()}`
      }
      className={cn(
        classes,
        'grid place-items-center border border-dashed border-white/50 bg-white/10 text-[clamp(0.6rem,1.6vmin,0.875rem)] font-black',
      )}
      role="img"
    >
      {kind === 'athlete' ? 'VÕ' : 'CLB'}
    </div>
  );
}
