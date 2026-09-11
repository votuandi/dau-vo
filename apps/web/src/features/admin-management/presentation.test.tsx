import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import { clearToasts } from '@/components/ui/toast';
import { ApiClientError } from '@/services/api/client';
import { notifyMutationError, notifyMutationSuccess } from './presentation';

afterEach(() => {
  clearToasts();
});

describe('admin mutation notifications', () => {
  it('shows a consistent success toast', () => {
    render(<Toaster />);
    act(() => {
      notifyMutationSuccess('Cập nhật trận đấu thành công.');
    });

    expect(screen.getByRole('status')).toHaveTextContent('Cập nhật trận đấu thành công.');
  });

  it('uses a meaningful known backend error and logs technical context', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Toaster />);
    const error = new ApiClientError(409, {
      code: 'TOURNAMENT_ARCHIVED',
      message: 'Matches cannot be created in an archived tournament',
    });

    act(() => {
      notifyMutationError(error, 'Không thể tạo trận đấu.');
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không thể tạo trận trong giải đấu đã lưu trữ.',
    );
    expect(consoleError).toHaveBeenCalledWith('Admin mutation failed', error);
  });

  it('never exposes stack-like backend details to the user', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Toaster />);
    const error = new ApiClientError(500, {
      message: 'PrismaClientKnownRequestError:\n    at updateMatch (service.ts:10:2)',
    });

    act(() => {
      notifyMutationError(error, 'Không thể lưu thay đổi.');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Không thể lưu thay đổi.');
    expect(screen.queryByText(/PrismaClientKnownRequestError/u)).not.toBeInTheDocument();
  });
});
