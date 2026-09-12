import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateInput, formatDateOnly, parseDateOnly } from './date-input';

describe('DateInput', () => {
  it('renders date-only values in Vietnamese format and commits a canonical date', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput id="start" onChange={onChange} value="2026-09-12" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('12/09/2026');
    await user.clear(input);
    await user.type(input, '01/10/2026');
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith('2026-10-01');
  });

  it('associates an invalid typed date with an accessible error without submitting it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput id="end" onChange={onChange} value="" />);

    const input = screen.getByRole('textbox');
    await user.type(input, '31/02/2026');
    await user.tab();

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Nhập ngày hợp lệ');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps date conversion strict', () => {
    expect(formatDateOnly('2026-02-03')).toBe('03/02/2026');
    expect(parseDateOnly('29/02/2025')).toBeNull();
    expect(parseDateOnly('29/02/2024')).toBe('2024-02-29');
  });
});
