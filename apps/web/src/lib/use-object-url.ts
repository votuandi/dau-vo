import { useEffect, useState } from 'react';

/**
 * A blob URL for previewing a local file. The URL is created once per file
 * and revoked when the file changes or the component unmounts, so previews
 * never leak memory on re-render.
 */
export function useObjectUrl(file: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // jsdom and some embedded browsers do not implement blob URLs.
    if (!file || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [file]);

  return url;
}
