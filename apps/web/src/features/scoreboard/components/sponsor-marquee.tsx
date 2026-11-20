import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SponsorLogo } from '@/features/tournament-watch/watch-sponsor-strip';
import type { PublicSponsor } from '@/services/api/watch';

/** Pixels per second; slow enough to read a logo while it passes. */
const SPEED = 45;

function LogoRun({
  sponsors,
  repeat,
  hidden = false,
}: {
  readonly sponsors: readonly PublicSponsor[];
  readonly repeat: number;
  readonly hidden?: boolean;
}) {
  return (
    <ul aria-hidden={hidden || undefined} className="sponsor-marquee-run flex h-full shrink-0">
      {Array.from({ length: repeat }, (_, copy) =>
        sponsors.map((sponsor) => (
          <li
            // Repeats exist only to fill the loop; assistive technology reads each sponsor once.
            aria-hidden={copy > 0 || undefined}
            // Each logo, without a frame, is as tall as the strip; its width follows the logo.
            className="mr-4 flex h-full shrink-0 items-center sm:mr-6"
            key={`${String(copy)}-${sponsor.id}`}
            title={sponsor.name}
          >
            <SponsorLogo className="h-full w-auto max-w-none" sponsor={sponsor} />
          </li>
        )),
      )}
    </ul>
  );
}

/**
 * Sponsor logos scrolling from right to left without end: after the last
 * sponsor comes the first again. One run repeats the sponsors until it is at
 * least as wide as the header space; two identical runs side by side make the
 * loop seamless. Reduced-motion users get a still row.
 */
export function SponsorMarquee({ sponsors }: { readonly sponsors: readonly PublicSponsor[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [setWidth, setSetWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure) return;
    const update = () => {
      setViewportWidth(viewport.clientWidth);
      setSetWidth(measure.scrollWidth);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    // Logos change width as their images load, so keep measuring.
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(measure);
    return () => {
      observer.disconnect();
    };
  }, [sponsors]);

  if (sponsors.length === 0) return <div aria-hidden="true" className="min-w-0 flex-1" />;
  const repeat = setWidth > 0 ? Math.max(1, Math.ceil(viewportWidth / setWidth)) : 1;
  const runWidth = setWidth * repeat;
  const style = {
    '--marquee-duration': `${String(Math.max(6, runWidth / SPEED))}s`,
  } as CSSProperties;

  return (
    <div
      aria-label="Nhà tài trợ"
      // A slim strip that fits inside the header row next to the match code button.
      className="sponsor-marquee relative h-7 min-w-0 flex-1 overflow-hidden sm:h-8"
      ref={viewportRef}
      role="region"
    >
      {/* One set of logos, out of sight, to measure how wide a single pass is. */}
      <div
        aria-hidden="true"
        className="invisible absolute inset-y-0 left-0 flex h-full"
        ref={measureRef}
      >
        <LogoRun hidden repeat={1} sponsors={sponsors} />
      </div>
      <div
        className="sponsor-marquee-track flex h-full w-max"
        data-moving={setWidth > 0}
        style={style}
      >
        <LogoRun repeat={repeat} sponsors={sponsors} />
        <LogoRun hidden repeat={repeat} sponsors={sponsors} />
      </div>
    </div>
  );
}
