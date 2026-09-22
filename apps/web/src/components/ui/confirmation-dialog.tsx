import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

interface ConfirmationDialogProps {
  readonly actionLabel: string;
  readonly busy?: boolean;
  readonly cancelLabel?: string;
  readonly description: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly warning?: string | undefined;
}

export function ConfirmationDialog({
  actionLabel,
  busy = false,
  cancelLabel = 'Hủy',
  description,
  onCancel,
  onConfirm,
  title,
  warning,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const actionRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    actionRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onCancel();
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, onCancel]);

  return createPortal(
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4"
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-blue-950 p-6 text-white shadow-2xl"
        ref={dialogRef}
      >
        <h2 className="text-xl font-black" id={titleId}>
          {title}
        </h2>
        <p className="mt-3 text-sky-100" id={descriptionId}>
          {description}
        </p>
        {warning ? (
          <p className="mt-3 rounded-xl bg-red-400/15 p-3 text-sm font-semibold text-red-100">
            {warning}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
            {cancelLabel}
          </Button>
          <Button
            disabled={busy}
            onClick={onConfirm}
            ref={actionRef}
            type="button"
            variant={warning ? 'destructive' : 'default'}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
