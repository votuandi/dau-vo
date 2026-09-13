import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/** A small, dependency-free modal primitive used where a form dialog is needed. */
export function Dialog({
  children,
  description,
  onClose,
  pending = false,
  title,
  initialFocusRef,
  className = '',
}: {
  readonly children: React.ReactNode;
  readonly description: string;
  readonly onClose: () => void;
  readonly pending?: boolean;
  readonly title: string;
  readonly initialFocusRef?: React.RefObject<HTMLElement | null>;
  readonly className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    initialFocusRef?.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [initialFocusRef, onClose, pending]);

  return createPortal(
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 p-4"
      role="dialog"
    >
      <div className="grid min-h-full place-items-center py-4">
        <div
          className={`w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl sm:p-7 ${className}`}
          ref={panel}
        >
          <h2 className="text-xl font-black" id={titleId}>
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>
            {description}
          </p>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
