import { useSyncExternalStore } from 'react';
import { dismissToast, getToasts, subscribeToToasts } from './toast';

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);

  return (
    <div
      aria-label="Thông báo"
      className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[24rem]"
    >
      {toasts.map((item) => (
        <div
          className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${
            item.variant === 'success'
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-950'
              : 'border-red-200 bg-red-50/95 text-red-950'
          }`}
          key={item.id}
          role={item.variant === 'destructive' ? 'alert' : 'status'}
        >
          <span aria-hidden="true" className="mt-0.5 font-black">
            {item.variant === 'success' ? '✓' : '!'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{item.title}</p>
            {item.description ? (
              <p className="mt-1 text-xs opacity-80">{item.description}</p>
            ) : null}
          </div>
          {item.action ? (
            <button
              className="rounded px-2 py-1 text-xs font-black uppercase underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              onClick={() => {
                item.action?.onClick();
                dismissToast(item.id);
              }}
              type="button"
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            aria-label="Đóng thông báo"
            className="rounded px-1 text-lg leading-none opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            onClick={() => {
              dismissToast(item.id);
            }}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
