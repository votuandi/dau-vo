import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';

export function MatchReadinessHover({
  ready,
  children,
}: {
  readonly ready: boolean;
  readonly children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div
      className="sm:relative"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <Button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={`h-6 min-h-0 rounded-full px-3 py-0 text-xs font-semibold leading-4 text-white ${ready ? 'bg-green-700 hover:bg-green-800' : 'bg-red-700 hover:bg-red-800'}`}
        onFocus={() => {
          setOpen(true);
        }}
        onClick={() => {
          setOpen(true);
        }}
      >
        {ready ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
      </Button>
      {open ? (
        <div
          id={id}
          className="absolute inset-x-3 top-full z-30 pt-2 sm:left-auto sm:right-0 sm:w-80"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
