import { Alert } from '@/components/ui/alert';
import { isLiveWatchDisabled, isWatchNotFound } from './watch-errors';

/** Inline message for a failed spectator request; a closed tournament gets a warning, not an error. */
export function WatchErrorMessage({
  error,
  notFoundMessage,
  fallbackMessage,
}: {
  readonly error: unknown;
  readonly notFoundMessage: string;
  readonly fallbackMessage: string;
}) {
  if (isLiveWatchDisabled(error))
    return (
      <Alert role="alert" tone="warning">
        <p className="font-semibold text-amber-900">
          Giải đấu này không cho phép theo dõi trực tiếp.
        </p>
        <p>Vui lòng liên hệ Ban tổ chức giải đấu để biết thêm chi tiết</p>
      </Alert>
    );
  return (
    <Alert role="alert" tone="error">
      {isWatchNotFound(error) ? notFoundMessage : fallbackMessage}
    </Alert>
  );
}
