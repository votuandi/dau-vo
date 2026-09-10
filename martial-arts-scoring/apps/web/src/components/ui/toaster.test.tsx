import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToasts, toast } from './toast';
import { Toaster } from './toaster';

afterEach(() => {
  clearToasts();
});

describe('Toaster', () => {
  it('announces success and destructive notifications accessibly', () => {
    render(<Toaster />);

    act(() => {
      toast({ title: 'Tạo giải đấu thành công.', variant: 'success' });
      toast({ title: 'Không thể cập nhật trận đấu.', variant: 'destructive' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Tạo giải đấu thành công.');
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể cập nhật trận đấu.');
  });

  it('allows a notification to be dismissed without a browser alert', async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    act(() => {
      toast({ title: 'Đã lưu thay đổi.', variant: 'success' });
    });

    await user.click(screen.getByRole('button', { name: 'Đóng thông báo' }));

    expect(screen.queryByText('Đã lưu thay đổi.')).not.toBeInTheDocument();
  });

  it('runs an action from a snackbar notification', async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast({
        action: { label: 'HOÀN TÁC', onClick: undo },
        durationMs: 15_000,
        title: 'Đã hủy kết quả Hiệp 1.',
        variant: 'success',
      });
    });

    await user.click(screen.getByRole('button', { name: 'HOÀN TÁC' }));

    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Đã hủy kết quả Hiệp 1.')).not.toBeInTheDocument();
  });
});
