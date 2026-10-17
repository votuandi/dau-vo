import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardCopyButton } from './clipboard-copy-button';

const LINK = 'http://192.168.1.10/giam-dinh?token=abc';

describe('ClipboardCopyButton', () => {
  let execCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });

  it('uses the Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ClipboardCopyButton accessibleLabel="Sao chép link đăng nhập" value={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép link đăng nhập' }));

    expect(await screen.findByText('Đã sao chép')).toBeVisible();
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to a selection copy outside a secure context', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<ClipboardCopyButton accessibleLabel="Sao chép link đăng nhập" value={LINK} />);
    const button = screen.getByRole('button', { name: 'Sao chép link đăng nhập' });

    fireEvent.click(button);

    expect(await screen.findByText('Đã sao chép')).toBeVisible();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('falls back when the Clipboard API rejects the write', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ClipboardCopyButton accessibleLabel="Sao chép link đăng nhập" value={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép link đăng nhập' }));

    expect(await screen.findByText('Đã sao chép')).toBeVisible();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports an error when every copy method fails', async () => {
    execCommand.mockReturnValue(false);
    render(<ClipboardCopyButton accessibleLabel="Sao chép link đăng nhập" value={LINK} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép link đăng nhập' }));

    expect(await screen.findByText('Không thể sao chép')).toBeVisible();
  });
});
