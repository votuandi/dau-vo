/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { appEnv } from '@/config/env';
import { Button } from '@/components/ui/button';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export function tournamentImageUrl(imagePath: string | null): string | null {
  return imagePath ? `${appEnv.apiBaseUrl}/media/${imagePath}` : null;
}
export function TournamentImage({
  imagePath,
  name,
  className = 'size-16',
}: {
  readonly imagePath: string | null;
  readonly name: string;
  readonly className?: string;
}) {
  const src = tournamentImageUrl(imagePath);
  return src ? (
    <img
      alt={`Logo giải đấu ${name}`}
      className={`${className} rounded-xl border border-border object-cover`}
      src={src}
    />
  ) : (
    <div
      aria-label={`Chưa có logo cho giải đấu ${name}`}
      className={`${className} grid place-items-center rounded-xl border border-dashed border-primary/30 bg-primary/5 text-lg font-black text-primary`}
      role="img"
    >
      🏆
    </div>
  );
}
export function TournamentImagePicker({
  disabled,
  imagePath,
  name,
  onRemove,
  onUpload,
  pending,
}: {
  readonly disabled?: boolean;
  readonly imagePath: string | null;
  readonly name: string;
  readonly onRemove?: () => void;
  readonly onUpload: (file: File) => void;
  readonly pending?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function choose(next: File | undefined) {
    setError('');
    if (!next) return;
    if (!TYPES.has(next.type)) {
      setError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
      return;
    }
    if (next.size > MAX_BYTES) {
      setError('Ảnh phải nhỏ hơn hoặc bằng 2 MiB.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }
  const display = preview ?? tournamentImageUrl(imagePath);
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start gap-4">
        {display ? (
          <img
            alt={preview ? `Xem trước logo giải đấu ${name}` : `Logo giải đấu ${name}`}
            className="size-20 rounded-xl border border-border object-cover"
            src={display}
          />
        ) : (
          <TournamentImage className="size-20" imagePath={null} name={name} />
        )}
        <div className="min-w-0 flex-1">
          <label className="text-sm font-semibold" htmlFor="tournament-image">
            Logo giải đấu{' '}
            <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="mt-2 block w-full text-sm"
            disabled={(disabled ?? false) || (pending ?? false)}
            id="tournament-image"
            onChange={(event) => {
              choose(event.target.files?.[0]);
            }}
            type="file"
          />
          {file ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {file.name} · {file.type} · {(file.size / 1024).toFixed(0)} KB
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG hoặc WebP · tối đa 2 MiB</p>
          )}
          {error ? (
            <p className="mt-1 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {file ? (
              <Button
                disabled={(disabled ?? false) || (pending ?? false)}
                onClick={() => {
                  onUpload(file);
                }}
                size="sm"
                type="button"
              >
                {pending ? 'Đang tải ảnh…' : imagePath ? 'Thay logo' : 'Tải logo lên'}
              </Button>
            ) : null}
            {imagePath && onRemove ? (
              <Button
                disabled={(disabled ?? false) || (pending ?? false)}
                onClick={onRemove}
                size="sm"
                type="button"
                variant="ghost"
              >
                Gỡ logo
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
