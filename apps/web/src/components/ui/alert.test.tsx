import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from './alert';

describe('Alert', () => {
  it.each([
    ['info', 'bg-blue-50', 'lucide-info'],
    ['warning', 'bg-amber-50', 'lucide-triangle-alert'],
    ['error', 'bg-red-50', 'lucide-circle-x'],
    ['success', 'bg-emerald-50', 'lucide-circle-check'],
  ] as const)('renders the %s tone with its own colour and icon', (tone, surface, icon) => {
    render(
      <Alert role="status" title="Tiêu đề" tone={tone}>
        Nội dung
      </Alert>,
    );
    const alert = screen.getByRole('status');
    expect(alert).toHaveAttribute('data-tone', tone);
    expect(alert).toHaveClass(surface);
    expect(alert.querySelector('svg')).toHaveClass(icon);
    expect(screen.getByText('Tiêu đề')).toBeVisible();
    expect(screen.getByText('Nội dung')).toBeVisible();
  });

  it('defaults to the info tone', () => {
    render(<Alert role="status">Thông tin</Alert>);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'info');
  });
});
