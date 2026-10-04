import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('shows the reference page sequence and navigates to numbered and last pages', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={1} totalPages={10} />);

    expect(screen.getByRole('button', { name: 'Trang 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Trang đầu' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trang 4' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trang 3' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Trang cuối' }));
    expect(onPageChange).toHaveBeenLastCalledWith(10);
  });

  it('keeps the current page visible between gaps and supports adjacent navigation', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination onPageChange={onPageChange} page={5} totalPages={10} />);

    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Trang 5' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);
    await user.click(screen.getByRole('button', { name: 'Trang đầu' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('disables forward navigation on the final page and handles an empty result', () => {
    const { rerender } = render(<Pagination onPageChange={vi.fn()} page={10} totalPages={10} />);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang cuối' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang 8' })).toBeInTheDocument();

    rerender(<Pagination onPageChange={vi.fn()} page={1} totalPages={0} />);
    expect(
      screen.getAllByRole('button').filter((button) => button.hasAttribute('disabled')),
    ).toHaveLength(4);
    expect(screen.queryByText('…')).not.toBeInTheDocument();
  });
});
