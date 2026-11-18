import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { MatchReadinessHover } from './match-readiness-hover';

it('opens on focus and click, closes with Escape, and reflects readiness changes', async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <MatchReadinessHover ready={false}>
      <p>Chi tiết kết nối</p>
    </MatchReadinessHover>,
  );
  expect(screen.queryByText('Chi tiết kết nối')).not.toBeInTheDocument();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Chưa sẵn sàng' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await user.keyboard('{Enter}');
  expect(screen.getByText('Chi tiết kết nối')).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByText('Chi tiết kết nối')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button'));
  expect(screen.getByText('Chi tiết kết nối')).toBeVisible();
  rerender(
    <MatchReadinessHover ready>
      <p>Chi tiết kết nối</p>
    </MatchReadinessHover>,
  );
  expect(screen.getByRole('button', { name: 'Sẵn sàng' })).toHaveClass('bg-green-700');
});
