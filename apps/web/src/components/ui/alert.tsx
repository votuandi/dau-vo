import type * as React from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Inline alert tones. Each has its own colour and icon shape, so the tone never relies on
 * colour alone:
 * - `info` (blue, ⓘ): neutral information.
 * - `warning` (yellow, ⚠): something blocks or limits the action, or has consequences.
 * - `error` (red, ⊗): an operation failed.
 * - `success` (green, ✓): an operation completed.
 */
const tones = {
  info: {
    className: 'border-blue-200 bg-blue-50',
    iconClassName: 'text-blue-600',
    titleClassName: 'text-blue-900',
    Icon: Info,
  },
  warning: {
    className: 'border-amber-300 bg-amber-50',
    iconClassName: 'text-amber-500',
    titleClassName: 'text-amber-900',
    Icon: TriangleAlert,
  },
  error: {
    className: 'border-red-200 bg-red-50',
    iconClassName: 'text-red-600',
    titleClassName: 'text-red-900',
    Icon: CircleX,
  },
  success: {
    className: 'border-emerald-200 bg-emerald-50',
    iconClassName: 'text-emerald-600',
    titleClassName: 'text-emerald-900',
    Icon: CircleCheck,
  },
} as const;

export type AlertTone = keyof typeof tones;

/** An inline message box with a tone-specific colour and icon. */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> & {
  readonly tone?: AlertTone;
  readonly title?: React.ReactNode;
}) {
  const { className: toneClassName, iconClassName, titleClassName, Icon } = tones[tone];
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-3.5 text-sm leading-6',
        toneClassName,
        className,
      )}
      data-tone={tone}
      {...props}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', iconClassName)} />
      <div className="min-w-0 flex-1 text-slate-800">
        {title ? <p className={cn('font-bold', titleClassName)}>{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
