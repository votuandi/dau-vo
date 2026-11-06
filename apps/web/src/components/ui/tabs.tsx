import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Horizontal scroll container for a tab strip styled with `tab-styles`. */
export function TabScroller({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('-mx-1 overflow-x-auto px-1 pb-1', className)} {...props}>
      {children}
    </div>
  );
}

export function TabCount({
  active,
  label,
  variant = 'solid',
  children,
}: {
  readonly active: boolean;
  readonly label?: string;
  /** `solid` sits on a filled pill tab; `subtle` sits on chip or underline tabs. */
  readonly variant?: 'solid' | 'subtle';
  readonly children: React.ReactNode;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        'min-w-6 rounded-full px-1.5 text-center text-xs font-bold tabular-nums leading-5',
        active
          ? variant === 'solid'
            ? 'bg-white/20 text-primary-foreground'
            : 'bg-primary/15 text-primary'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
