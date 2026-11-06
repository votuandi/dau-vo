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

// Level 2 — a compact chip row for picking an item inside a section (e.g. a weight class).
// Lighter than the pill strip so it never reads as a sibling of the page-level tabs.
export const chipListClassName = 'flex w-max min-w-full flex-nowrap gap-2';

/** Per-chip colours: `idle` for the resting chip, `active` for the selected (filled) chip. */
export interface ChipTone {
  readonly idle: string;
  readonly active: string;
}

const defaultChipTone: ChipTone = {
  idle: 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
  active: 'border-primary bg-primary/10 text-primary',
};

export function chipTriggerClassName(active: boolean, tone: ChipTone = defaultChipTone): string {
  return cn(
    'inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    active ? tone.active : tone.idle,
  );
}

// Level 3 — underline tabs that sit on the top edge of a content card.
export const underlineListClassName = 'flex w-max min-w-full gap-1 border-b border-border';

export function underlineTriggerClassName(active: boolean): string {
  return cn(
    '-mb-px inline-flex min-h-10 cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold outline-none transition-colors duration-150 focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0',
    active
      ? 'border-primary text-primary'
      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
  );
}
