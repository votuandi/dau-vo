import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export function PageLoading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <div className="grid min-h-[16rem] place-items-center" role="status">
      <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        {label}
      </div>
    </div>
  );
}

export function PageError({
  title = 'Không thể tải dữ liệu',
  message = 'Vui lòng kiểm tra kết nối và thử lại.',
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="grid min-h-[16rem] place-items-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-600" />
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {onRetry ? (
          <Button className="mt-5" onClick={onRetry} variant="outline">
            <RefreshCw className="h-4 w-4" /> Thử lại
          </Button>
        ) : null}
      </div>
    </div>
  );
}
