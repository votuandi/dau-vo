import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  violet: 'from-violet-600 via-indigo-600 to-blue-700 shadow-indigo-500/20',
  sky: 'from-sky-700 via-cyan-700 to-blue-800 shadow-sky-500/20',
  emerald: 'from-emerald-700 via-teal-700 to-emerald-900 shadow-emerald-500/20',
  rose: 'from-rose-700 via-pink-700 to-fuchsia-800 shadow-rose-500/20',
  amber: 'from-orange-700 via-orange-800 to-red-800 shadow-orange-500/20',
} as const;

export function DashboardStatCard({
  label,
  value,
  detail,
  icon,
  tone = 'violet',
  index = 0,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly detail: string;
  readonly icon: ReactNode;
  readonly tone?: keyof typeof tones;
  readonly index?: number;
}) {
  return (
    <article
      className={cn(
        'dashboard-stat-card group relative isolate min-w-0 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br p-5 text-white shadow-lg sm:p-6',
        tones[tone],
      )}
      style={{ animationDelay: `${String(index * 70)}ms` }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-12 -z-10 size-40 rounded-full border-[22px] border-white/10 transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-6 -z-10 size-36 rounded-full bg-white/5"
      />
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{label}</h3>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/15 shadow-sm backdrop-blur-sm transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none [&_svg]:size-5">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-4xl font-black tracking-tight tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
      </p>
      <p className="mt-2 text-xs leading-5 text-white">{detail}</p>
    </article>
  );
}
