import { useId } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSafeWebsiteUrl } from '@/lib/website-url';
import type { PublicSponsor } from '@/services/api/watch';

/** Logo, or the sponsor's initial when it has none. */
export function SponsorLogo({
  sponsor,
  className,
}: {
  readonly sponsor: PublicSponsor;
  readonly className?: string;
}) {
  return sponsor.imageUrl ? (
    <img
      alt={sponsor.name}
      className={cn('max-h-full max-w-full object-contain', className)}
      draggable={false}
      loading="lazy"
      src={sponsor.imageUrl}
    />
  ) : (
    <span className={cn('truncate px-2 text-sm font-black text-slate-700', className)}>
      {sponsor.name}
    </span>
  );
}

/**
 * One sponsor: hovering or focusing shows its details in a tooltip; clicking
 * opens its advertising link ("Link quảng cáo") in a new tab when it has one.
 */
function SponsorItem({ sponsor }: { readonly sponsor: PublicSponsor }) {
  const tooltipId = useId();
  const link = isSafeWebsiteUrl(sponsor.adUrl) ? sponsor.adUrl : null;
  const tileClassName =
    'grid h-16 w-32 place-items-center rounded-xl border border-border bg-white p-2 shadow-sm outline-none transition-[box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring sm:h-20 sm:w-40';
  const content = <SponsorLogo sponsor={sponsor} />;
  return (
    <li className="group relative">
      {link ? (
        <a
          aria-describedby={tooltipId}
          aria-label={`${sponsor.name} (mở trong tab mới)`}
          className={cn(tileClassName, 'hover:-translate-y-0.5 hover:shadow-md')}
          href={link}
          rel="noopener noreferrer sponsored"
          target="_blank"
        >
          {content}
        </a>
      ) : (
        <span
          aria-describedby={tooltipId}
          aria-label={sponsor.name}
          className={tileClassName}
          role="img"
          // Focusable so keyboard users can read the tooltip too.
          tabIndex={0}
        >
          {content}
        </span>
      )}
      <span
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl bg-slate-900 p-3 text-left text-xs leading-5 text-white opacity-0 shadow-xl transition-opacity duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
        id={tooltipId}
        role="tooltip"
      >
        <span className="block text-sm font-bold">{sponsor.name}</span>
        <span className="block text-sky-200">{sponsor.tierName}</span>
        {sponsor.details ? (
          <span className="mt-1 line-clamp-5 block whitespace-pre-line text-white/85">
            {sponsor.details}
          </span>
        ) : null}
        {link ? (
          <span className="mt-1.5 flex items-center gap-1 font-semibold text-sky-200">
            <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{new URL(link).hostname}</span>
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-full -translate-x-1/2 border-[6px] border-transparent border-t-slate-900"
        />
      </span>
    </li>
  );
}

export function WatchSponsorStrip({ sponsors }: { readonly sponsors: readonly PublicSponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <section aria-labelledby="watch-sponsors-heading" className="space-y-2">
      <h2 className="text-sm font-bold text-muted-foreground" id="watch-sponsors-heading">
        Nhà tài trợ
      </h2>
      <ul className="flex flex-wrap gap-3">
        {sponsors.map((sponsor) => (
          <SponsorItem key={sponsor.id} sponsor={sponsor} />
        ))}
      </ul>
    </section>
  );
}
