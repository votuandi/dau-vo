import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatTone = 'violet' | 'sky' | 'emerald' | 'rose' | 'amber';

export function DashboardStatCard({
  label,
  value,
  detail,
  icon,
  index = 0,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly detail: string;
  readonly icon: ReactNode;
  readonly tone?: StatTone;
  readonly index?: number;
}) {
  return (
    <article
      className={cn(
        'dashboard-stat-card min-w-0 rounded-2xl border border-foreground/[0.08] bg-card p-5 text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6',
      )}
      style={{ animationDelay: `${String(index * 45)}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <span aria-hidden="true" className="text-muted-foreground/75 [&_svg]:size-4">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </article>
  );
}
