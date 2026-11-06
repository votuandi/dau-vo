import type * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Consistent top-of-page block for admin screens: back link, title, summary and actions. */
export function PageHeader({
  backTo,
  backLabel,
  title,
  description,
  badge,
  media,
  actions,
  compact = false,
  className,
}: {
  readonly backTo?: string;
  readonly backLabel?: string;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly badge?: React.ReactNode;
  readonly media?: React.ReactNode;
  readonly actions?: React.ReactNode;
  /** Smaller title and tighter spacing for working screens that need room below the header. */
  readonly compact?: boolean;
  readonly className?: string;
}) {
  return (
    <header className={cn(compact ? 'space-y-2' : 'space-y-4', className)}>
      {backTo ? (
        <Link
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to={backTo}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {backLabel}
        </Link>
      ) : null}
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:justify-between',
          compact ? 'sm:items-center' : 'sm:items-end',
        )}
      >
        <div className="flex min-w-0 items-center gap-4">
          {media}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1
                className={cn(
                  'min-w-0 break-words font-black tracking-tight',
                  compact ? 'text-xl md:text-2xl' : 'text-3xl md:text-4xl',
                )}
              >
                {title}
              </h1>
              {badge}
            </div>
            {description ? (
              <div
                className={cn(
                  'text-sm leading-6 text-muted-foreground',
                  compact ? 'mt-0.5' : 'mt-2',
                )}
              >
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
