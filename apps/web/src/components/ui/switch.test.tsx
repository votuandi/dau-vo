import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './switch';

function Controlled({ disabled = false }: { readonly disabled?: boolean }) {
  const [checked, setChecked] = useState(false);
  return (
    <Switch
      checked={checked}
      description="Mô tả ngắn"
      disabled={disabled}
      label="Ghi nhận điểm"
      onCheckedChange={setChecked}
    />
  );
}

describe('Switch', () => {
  it('toggles from its track, its label and the keyboard', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: 'Ghi nhận điểm' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAccessibleDescription('Mô tả ngắn');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByText('Ghi nhận điểm'));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('cannot be changed while disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <Switch checked={false} disabled label="Ghi nhận điểm" onCheckedChange={onCheckedChange} />,
    );
    const toggle = screen.getByRole('switch', { name: 'Ghi nhận điểm' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    await user.click(screen.getByText('Ghi nhận điểm'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
