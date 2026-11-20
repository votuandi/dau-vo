import { cn } from '@/lib/utils';
import type { PublicSponsor } from '@/services/api/watch';

/** Logo, or the sponsor's name when it has none. */
export function SponsorLogo({
  sponsor,
  className,
  alt = sponsor.name,
}: {
  readonly sponsor: PublicSponsor;
  readonly className?: string;
  /** Empty when a parent element already names the sponsor. */
  readonly alt?: string;
}) {
  return sponsor.imageUrl ? (
    <img
      alt={alt}
      className={cn('max-h-full max-w-full object-contain', className)}
      draggable={false}
      loading="lazy"
      src={sponsor.imageUrl}
    />
  ) : (
    <span
      className={cn(
        'flex items-center whitespace-nowrap px-2 text-sm font-black text-slate-700',
        className,
      )}
    >
      {sponsor.name}
    </span>
  );
}
