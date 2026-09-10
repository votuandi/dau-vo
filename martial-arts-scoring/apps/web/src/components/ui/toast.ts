export type ToastVariant = 'success' | 'destructive';

export interface ToastInput {
  readonly action?: { label: string; onClick: () => void } | undefined;
  readonly description?: string;
  readonly durationMs?: number | undefined;
  readonly title: string;
  readonly variant: ToastVariant;
}

export interface ToastItem extends ToastInput {
  readonly id: number;
}

const listeners = new Set<() => void>();
let items: readonly ToastItem[] = [];
let nextId = 1;

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function dismissToast(id: number): void {
  const nextItems = items.filter((item) => item.id !== id);
  if (nextItems.length === items.length) {
    return;
  }

  items = nextItems;
  publish();
}

export function toast(input: ToastInput): number {
  const id = nextId++;
  items = [...items, { ...input, id }].slice(-4);
  publish();

  window.setTimeout(() => {
    dismissToast(id);
  }, input.durationMs ?? 5_000);
  return id;
}

export function getToasts(): readonly ToastItem[] {
  return items;
}

export function subscribeToToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearToasts(): void {
  if (items.length === 0) {
    return;
  }
  items = [];
  publish();
}
