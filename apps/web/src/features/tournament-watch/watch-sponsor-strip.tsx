import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { SponsorLogo } from '@/features/sponsors/sponsor-logo';
import { SponsorMarquee } from '@/features/sponsors/sponsor-marquee';
import { isSafeWebsiteUrl } from '@/lib/website-url';
import type { PublicSponsor } from '@/services/api/watch';

/**
 * Sponsor details, drawn in a portal above the logo. The scrolling strip clips
 * its overflow, so a tooltip inside it would be cut off.
 */
function SponsorTooltip({
  anchor,
  id,
  link,
  sponsor,
}: {
  readonly anchor: DOMRect;
  readonly id: string;
  readonly link: string | null;
  readonly sponsor: PublicSponsor;
}) {
  return createPortal(
    <span
      className="pointer-events-none fixed z-50 w-64 max-w-[80vw] -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900 p-3 text-left text-xs leading-5 text-white shadow-xl"
      id={id}
      role="tooltip"
      style={{ left: anchor.left + anchor.width / 2, top: anchor.top - 8 }}
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
    </span>,
    document.body,
  );
}

/**
 * One sponsor tile: hovering or focusing shows its details; clicking opens its
 * advertising link ("Link quảng cáo") in a new tab when it has one. Decorative
 * copies that only fill the loop are skipped by the keyboard.
 */
function SponsorTile({
  sponsor,
  decorative,
}: {
  readonly sponsor: PublicSponsor;
  readonly decorative: boolean;
}) {
  const tooltipId = useId();
  const ref = useRef<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const link = isSafeWebsiteUrl(sponsor.adUrl) ? sponsor.adUrl : null;
  const show = () => {
    setAnchor(ref.current?.getBoundingClientRect() ?? null);
  };
  const hide = () => {
    setAnchor(null);
  };
  useEffect(() => {
    if (!anchor) return;
    // A fixed tooltip would drift away from its logo when the page scrolls.
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', hide, { capture: true });
    };
  }, [anchor]);

  const shared = {
    'aria-describedby': anchor ? tooltipId : undefined,
    className:
      'flex h-full items-center rounded-xl border border-border bg-white px-3 py-2 shadow-sm outline-none transition-shadow duration-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
    onBlur: hide,
    onFocus: show,
    onMouseEnter: show,
    onMouseLeave: hide,
    tabIndex: decorative ? -1 : 0,
  };
  // The tile carries the sponsor's name, so the image inside stays unnamed.
  const logo = <SponsorLogo alt="" className="h-full w-auto max-w-none" sponsor={sponsor} />;
  return (
    <>
      {link ? (
        <a
          {...shared}
          aria-label={`${sponsor.name} (mở trong tab mới)`}
          href={link}
          ref={(element) => {
            ref.current = element;
          }}
          rel="noopener noreferrer sponsored"
          target="_blank"
        >
          {logo}
        </a>
      ) : (
        <span
          {...shared}
          aria-label={sponsor.name}
          ref={(element) => {
            ref.current = element;
          }}
          role="img"
        >
          {logo}
        </span>
      )}
      {anchor ? (
        <SponsorTooltip anchor={anchor} id={tooltipId} link={link} sponsor={sponsor} />
      ) : null}
    </>
  );
}

export function WatchSponsorStrip({ sponsors }: { readonly sponsors: readonly PublicSponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 aria-hidden="true" className="text-sm font-bold text-muted-foreground">
        Nhà tài trợ
      </h2>
      <SponsorMarquee
        className="h-16 w-full sm:h-20"
        itemClassName="mr-3"
        pauseOnHover
        renderSponsor={(sponsor, decorative) => (
          <SponsorTile decorative={decorative} sponsor={sponsor} />
        )}
        sponsors={sponsors}
      />
    </div>
  );
}
