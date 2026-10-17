import type * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  error: {
    className: 'border-destructive/25 bg-destructive/5 text-destructive',
    Icon: XCircle,
  },
  warning: { className: 'border-warning/25 bg-warning/5 text-warning', Icon: AlertTriangle },
  success: { className: 'border-success/25 bg-success/5 text-success', Icon: CheckCircle2 },
  info: { className: 'border-primary/20 bg-primary/5 text-primary', Icon: Info },
} as const;

export type AlertTone = keyof typeof tones;

/** An inline message box with an icon, so the tone never relies on color alone. */
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
  const { className: toneClassName, Icon } = tones[tone];
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-3.5 text-sm leading-6',
        toneClassName,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-foreground">
        {title ? <p className="font-bold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}
