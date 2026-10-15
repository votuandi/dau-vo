import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const RELOAD_FLAG = 'dau-vo:chunk-reload';

/**
 * Lazy route chunks are content-hashed, so a tab opened before a deploy asks
 * for files that no longer exist. Browsers word the failure differently.
 */
function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /dynamically imported module|module script failed|Loading chunk|Unable to preload CSS/iu.test(
    error.message,
  );
}

/** Route error boundary: reloads once for a stale chunk, otherwise offers a retry. */
export function RouteError() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (!chunkError) return;
    try {
      // Guard against a reload loop when the chunk is genuinely unavailable.
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, '1');
    } catch {
      return;
    }
    window.location.reload();
  }, [chunkError]);

  useEffect(() => {
    if (chunkError) return;
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // Storage unavailable; nothing to clear.
    }
  }, [chunkError]);

  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center" role="alert">
      <div className="max-w-md">
        <h1 className="text-xl font-bold">
          {chunkError ? 'Đã có phiên bản mới' : notFound ? 'Không tìm thấy trang' : 'Đã xảy ra lỗi'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {chunkError
            ? 'Ứng dụng vừa được cập nhật. Vui lòng tải lại trang để tiếp tục.'
            : 'Không thể hiển thị trang này. Vui lòng tải lại trang hoặc thử lại sau.'}
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            window.location.reload();
          }}
          type="button"
        >
          Tải lại trang
        </Button>
      </div>
    </div>
  );
}
