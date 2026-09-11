import { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CopyStatus = 'idle' | 'copied' | 'error';

interface ClipboardCopyButtonProps extends Omit<
  ButtonProps,
  'aria-label' | 'children' | 'onClick' | 'type'
> {
  readonly accessibleLabel: string;
  readonly copiedLabel?: string;
  readonly errorLabel?: string;
  readonly label?: string;
  readonly value: string;
}

function CopyIcon({ status }: { readonly status: CopyStatus }) {
  if (status === 'copied') {
    return (
      <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
        <path
          d="m5 12 4 4L19 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (status === 'error') {
    return (
      <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 8v5m0 3.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24">
      <rect height="13" rx="2" stroke="currentColor" strokeWidth="2" width="13" x="8" y="8" />
      <path
        d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ClipboardCopyButton({
  accessibleLabel,
  className,
  copiedLabel = 'Đã sao chép',
  errorLabel = 'Không thể sao chép',
  label = 'Sao chép',
  size = 'sm',
  value,
  variant = 'outline',
  ...props
}: ClipboardCopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const resetTimeout = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimeout.current !== null) {
        window.clearTimeout(resetTimeout.current);
      }
    },
    [],
  );

  async function copyValue(): Promise<void> {
    if (resetTimeout.current !== null) {
      window.clearTimeout(resetTimeout.current);
    }

    try {
      if (typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API is unavailable.');
      }

      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('error');
    }

    resetTimeout.current = window.setTimeout(() => {
      setStatus('idle');
    }, 2_500);
  }

  const statusLabel = status === 'copied' ? copiedLabel : status === 'error' ? errorLabel : label;

  return (
    <>
      <Button
        aria-label={accessibleLabel}
        className={cn(
          'gap-2',
          className,
          status === 'copied' &&
            'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100 hover:text-emerald-900',
          status === 'error' &&
            'border-red-300 bg-red-50 text-red-700 hover:border-red-400 hover:bg-red-100 hover:text-red-800',
        )}
        onClick={() => void copyValue()}
        size={size}
        type="button"
        variant={variant}
        {...props}
      >
        <CopyIcon status={status} />
        {statusLabel}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">
        {status === 'idle' ? '' : `${statusLabel}: ${accessibleLabel}`}
      </span>
    </>
  );
}
