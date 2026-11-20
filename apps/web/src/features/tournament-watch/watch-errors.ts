import { ApiClientError } from '@/services/api/client';

/** The organiser turned off "Cho phép theo dõi trực tiếp" for this tournament. */
export function isLiveWatchDisabled(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.status === 403 &&
    error.body.code === 'WATCH_LIVE_WATCH_DISABLED'
  );
}

export function isWatchNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

/** Not-found and closed tournaments are final answers; only transient failures are retried. */
export function retryWatchQuery(failureCount: number, error: unknown): boolean {
  return !isWatchNotFound(error) && !isLiveWatchDisabled(error) && failureCount < 2;
}
