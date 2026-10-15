import { formatKiB } from '@/lib/image-file';
import { useObjectUrl } from '@/lib/use-object-url';

/** Name, size and a thumbnail for a locally chosen image file. */
export function FileImagePreview({
  alt,
  className,
  file,
}: {
  readonly alt: string;
  readonly className: string;
  readonly file: File;
}) {
  const url = useObjectUrl(file);
  return (
    <>
      <span className="block break-all text-xs font-normal">
        {file.name} · {formatKiB(file.size)}
      </span>
      {url ? (
        <img alt={alt} className={`mt-2 shrink-0 object-cover ${className}`} src={url} />
      ) : null}
    </>
  );
}
