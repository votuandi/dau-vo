import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'red' | 'blue';
const tones: Record<Tone, string> = { neutral: 'bg-muted text-muted-foreground', success: 'bg-emerald-100 text-emerald-800', warning: 'bg-amber-100 text-amber-900', danger: 'bg-red-100 text-red-800', red: 'bg-red-600 text-white', blue: 'bg-blue-600 text-white' };
export function Badge({ className, tone = 'neutral', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) { return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold', tones[tone], className)} {...props} />; }
