import { useSyncExternalStore } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { dismissToast, getToasts, subscribeToToasts } from './toast';

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getToasts);

  return (
    <div
      aria-label="Thông báo"
      className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[25rem]"
    >
      {toasts.map((item) => (
        <div
          className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-xl shadow-slate-950/10 backdrop-blur-md transition-all ${
            item.variant === 'success'
              ? 'border-emerald-200/90 bg-white/95 text-emerald-950 ring-1 ring-emerald-500/10'
              : 'border-red-200/90 bg-white/95 text-red-950 ring-1 ring-red-500/10'
          }`}
          key={item.id}
          role={item.variant === 'destructive' ? 'alert' : 'status'}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
              item.variant === 'success'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {item.variant === 'success' ? (
              <CircleCheck className="size-4" />
            ) : (
              <CircleAlert className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-5">{item.title}</p>
            {item.description ? (
              <p className="mt-1 text-xs leading-5 opacity-80">{item.description}</p>
            ) : null}
          </div>
          {item.action ? (
            <button
              className="rounded-lg px-2 py-1 text-xs font-black uppercase underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
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
            className="grid size-6 shrink-0 place-items-center rounded-lg opacity-60 transition hover:bg-slate-900/5 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            onClick={() => {
              dismissToast(item.id);
            }}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
