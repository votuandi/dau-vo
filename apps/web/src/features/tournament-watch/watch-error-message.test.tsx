import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/services/api/client';
import { WatchErrorMessage } from './watch-error-message';
import { retryWatchQuery } from './watch-errors';

const disabled = new ApiClientError(403, { code: 'WATCH_LIVE_WATCH_DISABLED' });
const notFound = new ApiClientError(404, { code: 'WATCH_TOURNAMENT_NOT_FOUND' });

function renderError(error: unknown) {
  render(<WatchErrorMessage error={error} fallbackMessage="Lỗi" notFoundMessage="Không thấy" />);
}

describe('WatchErrorMessage', () => {
  it('warns that the tournament does not allow live watching', () => {
    renderError(disabled);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-tone', 'warning');
    expect(alert).toHaveTextContent('Giải đấu này không cho phép theo dõi trực tiếp.');
    expect(alert).toHaveTextContent('Vui lòng liên hệ Ban tổ chức giải đấu để biết thêm chi tiết');
  });

  it('reports an unknown code as an error', () => {
    renderError(notFound);
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Không thấy');
  });
});

describe('retryWatchQuery', () => {
  it('does not retry final answers but retries transient failures', () => {
    expect(retryWatchQuery(0, disabled)).toBe(false);
    expect(retryWatchQuery(0, notFound)).toBe(false);
    expect(retryWatchQuery(0, new ApiClientError(500, {}))).toBe(true);
    expect(retryWatchQuery(2, new ApiClientError(500, {}))).toBe(false);
  });
});
