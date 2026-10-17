import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
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
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        ref={dialogRef}
      >
        <div className="flex items-start gap-3">
          {warning ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
          ) : null}
          <h2 className="pt-1.5 text-xl font-black" id={titleId}>
            {title}
          </h2>
        </div>
        <p className="mt-3 leading-6 text-muted-foreground" id={descriptionId}>
          {description}
        </p>
        {warning ? (
          <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
            {warning}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
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
