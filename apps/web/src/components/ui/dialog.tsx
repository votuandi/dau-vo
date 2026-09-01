import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
interface Props { open: boolean; title: string; description?: string | undefined; children: ReactNode; onClose: () => void; dismissible?: boolean | undefined; }
export function Dialog({ open, title, description, children, onClose, dismissible = true }: Props) {
  useEffect(() => { if (!open) return; const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && dismissible) onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [dismissible, onClose, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="presentation"><section aria-describedby={description ? 'dialog-description' : undefined} aria-labelledby="dialog-title" aria-modal="true" className="relative max-h-[90dvh] w-full max-w-lg overflow-auto rounded-xl border bg-background p-6 text-foreground shadow-2xl" role="dialog">{dismissible ? <Button aria-label="Đóng" className="absolute right-3 top-3" onClick={onClose} size="icon" variant="ghost"><X className="h-4 w-4" /></Button> : null}<h2 className="pr-10 text-xl font-bold" id="dialog-title">{title}</h2>{description ? <p className="mt-2 text-sm text-muted-foreground" id="dialog-description">{description}</p> : null}<div className="mt-5">{children}</div></section></div>;
}
