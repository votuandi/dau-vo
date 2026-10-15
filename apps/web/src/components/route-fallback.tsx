/** Suspense fallback shown while a route's code chunk is loading. */
export function RouteFallback({ tone = 'light' }: { readonly tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={
        dark
          ? 'arena-background grid min-h-dvh w-full place-items-center text-white'
          : 'grid min-h-48 w-full place-items-center py-10'
      }
      role="status"
    >
      <div className="flex flex-col items-center gap-3">
        <div
          aria-hidden="true"
          className={`size-8 animate-spin rounded-full border-4 ${dark ? 'border-white/20 border-t-sky-300' : 'border-muted border-t-primary'}`}
        />
        <span
          className={`text-sm font-semibold ${dark ? 'text-sky-100' : 'text-muted-foreground'}`}
        >
          Đang tải…
        </span>
      </div>
    </div>
  );
}
