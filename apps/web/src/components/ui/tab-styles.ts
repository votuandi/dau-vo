import { cn } from '@/lib/utils';

// Shared look for every tab strip: a rounded track with the active tab raised as a
// filled pill. The strip scrolls horizontally on narrow screens instead of wrapping.
export const tabListClassName =
  'flex w-max min-w-full gap-1 rounded-2xl border border-border bg-white/70 p-1.5 shadow-sm backdrop-blur';

export function tabTriggerClassName(active: boolean): string {
  return cn(
    'inline-flex min-h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition-[color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:size-4 [&_svg]:shrink-0',
    active
      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
      : 'text-muted-foreground hover:bg-accent hover:text-primary',
  );
}
