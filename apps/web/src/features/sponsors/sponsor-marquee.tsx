import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { PublicSponsor } from '@/services/api/watch';
import { SponsorLogo } from './sponsor-logo';
import './sponsor-marquee.css';

/** Pixels per second; slow enough to read a logo while it passes. */
const SPEED = 45;

/** Renders one sponsor; `decorative` copies only fill the loop and must not be focusable. */
export type RenderSponsor = (sponsor: PublicSponsor, decorative: boolean) => ReactNode;

const renderLogo: RenderSponsor = (sponsor) => (
  <SponsorLogo className="h-full w-auto max-w-none" sponsor={sponsor} />
);

function LogoRun({
  sponsors,
  repeat,
  hidden = false,
  itemClassName,
  renderSponsor,
}: {
  readonly sponsors: readonly PublicSponsor[];
  readonly repeat: number;
  readonly hidden?: boolean;
  readonly itemClassName: string;
  readonly renderSponsor: RenderSponsor;
}) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex h-full shrink-0">
      {Array.from({ length: repeat }, (_, copy) =>
        sponsors.map((sponsor) => {
          const decorative = hidden || copy > 0;
          return (
            <li
              // Repeats exist only to fill the loop; assistive technology reads each sponsor once.
              aria-hidden={copy > 0 || undefined}
              className={cn('flex h-full shrink-0 items-center', itemClassName)}
              key={`${String(copy)}-${sponsor.id}`}
            >
              {renderSponsor(sponsor, decorative)}
            </li>
          );
        }),
      )}
    </ul>
  );
}

/**
 * Sponsor logos scrolling from right to left without end: after the last
 * sponsor comes the first again. Logos are as tall as the strip (set its
 * height with `className`) and keep their ratio. One run repeats the sponsors
 * until it is at least as wide as the strip; two identical runs side by side
 * make the loop seamless. Reduced-motion users get a still row.
 */
export function SponsorMarquee({
  sponsors,
  className,
  itemClassName = 'mr-4 sm:mr-6',
  pauseOnHover = false,
  renderSponsor = renderLogo,
}: {
  readonly sponsors: readonly PublicSponsor[];
  readonly className?: string;
  readonly itemClassName?: string;
  /** Stop while pointed at or focused, for logos people can hover and click. */
  readonly pauseOnHover?: boolean;
  readonly renderSponsor?: RenderSponsor;
}) {
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
  const style = {
    '--marquee-duration': `${String(Math.max(6, (setWidth * repeat) / SPEED))}s`,
  } as CSSProperties;
  const run = { itemClassName, renderSponsor, sponsors };

  return (
    <div
      aria-label="Nhà tài trợ"
      className={cn('sponsor-marquee relative min-w-0 overflow-hidden', className)}
      data-pausable={pauseOnHover}
      ref={viewportRef}
      role="region"
    >
      {/* One set of logos, out of sight, to measure how wide a single pass is. */}
      <div
        aria-hidden="true"
        className="invisible absolute inset-y-0 left-0 flex h-full"
        ref={measureRef}
      >
        <LogoRun hidden repeat={1} {...run} />
      </div>
      <div
        className="sponsor-marquee-track flex h-full w-max"
        data-moving={setWidth > 0}
        style={style}
      >
        <LogoRun repeat={repeat} {...run} />
        <LogoRun hidden repeat={repeat} {...run} />
      </div>
    </div>
  );
}
