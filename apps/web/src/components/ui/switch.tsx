import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * On/off toggle (WAI-ARIA `switch`). The visible label sits beside the track and both
 * toggle it; the optional description is announced with it.
 */
export function Switch({
  checked,
  className,
  description,
  disabled = false,
  label,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly label: ReactNode;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', disabled && 'opacity-60', className)}>
      <button
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        aria-labelledby={`${id}-label`}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-inner outline-none transition-colors duration-200 focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed',
          checked ? 'bg-primary' : 'bg-slate-300',
        )}
        disabled={disabled}
        id={id}
        onClick={() => {
          onCheckedChange(!checked);
        }}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-block size-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
      <div className="min-w-0">
        <label
          className={cn(
            'block text-sm font-semibold text-slate-700',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
          htmlFor={id}
          id={`${id}-label`}
        >
          {label}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500" id={`${id}-description`}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
