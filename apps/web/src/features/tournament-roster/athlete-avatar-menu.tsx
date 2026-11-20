import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { IMAGE_ACCEPT } from '@/lib/image-file';
import { cn } from '@/lib/utils';

/** The athlete's avatar, or their initial when there is no image yet. */
function AthleteAvatar({
  name,
  imageUrl,
  decorative = false,
}: {
  readonly name: string;
  readonly imageUrl: string | null | undefined;
  /** Inside a labelled button the avatar must not be announced a second time. */
  readonly decorative?: boolean;
}) {
  if (imageUrl)
    return (
      <img
        alt={decorative ? '' : `Ảnh đại diện ${name}`}
        className="size-12 shrink-0 rounded-full object-cover"
        loading="lazy"
        src={imageUrl}
      />
    );
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Chưa có ảnh đại diện cho ${name}`}
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-black text-primary"
      role={decorative ? undefined : 'img'}
    >
      {name.trim().slice(0, 1).toLocaleUpperCase('vi')}
    </span>
  );
}

/**
 * Clicking the avatar opens a small menu with "Thay đổi ảnh đại diện", which opens the file
 * picker. Clicking anywhere outside the menu, or pressing Escape, closes it.
 */
export function AthleteAvatarMenu({
  name,
  imageUrl,
  readOnly,
  busy,
  onFileSelected,
}: {
  readonly name: string;
  readonly imageUrl: string | null | undefined;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly onFileSelected: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (readOnly) return <AthleteAvatar imageUrl={imageUrl} name={name} />;

  return (
    <div className="relative shrink-0" ref={container}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Ảnh đại diện ${name}`}
        className={cn(
          'block rounded-full outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-primary/25',
          open && 'ring-2 ring-primary/40',
          busy && 'opacity-60',
        )}
        disabled={busy}
        onClick={() => {
          setOpen((current) => !current);
        }}
        ref={trigger}
        title="Thay đổi ảnh đại diện"
        type="button"
      >
        <AthleteAvatar decorative imageUrl={imageUrl} name={name} />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-20 mt-2 min-w-max rounded-xl border border-border bg-card p-1 shadow-lg"
          id={menuId}
          role="menu"
        >
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
            onClick={() => {
              setOpen(false);
              fileInput.current?.click();
            }}
            role="menuitem"
            type="button"
          >
            <ImagePlus aria-hidden="true" className="size-4 text-primary" />
            Thay đổi ảnh đại diện
          </button>
        </div>
      ) : null}
      <input
        accept={IMAGE_ACCEPT}
        aria-label={`Chọn ảnh đại diện mới cho ${name}`}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFileSelected(file);
        }}
        ref={fileInput}
        tabIndex={-1}
        type="file"
      />
    </div>
  );
}
