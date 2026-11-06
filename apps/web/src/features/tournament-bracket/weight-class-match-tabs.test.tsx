import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WeightClassMatchTabs } from './weight-class-match-tabs';

function weightClass(
  id: string,
  name: string,
  bracketProgress?: 'NONE' | 'DRAWN' | 'IN_PROGRESS' | 'COMPLETED',
) {
  return {
    id,
    tournamentId: 't-1',
    name,
    details: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(bracketProgress ? { bracketProgress } : {}),
  };
}

describe('WeightClassMatchTabs', () => {
  it('announces each weight class bracket progress and shows a legend', () => {
    render(
      <WeightClassMatchTabs
        classes={[
          weightClass('w-1', 'Nam 61kg', 'IN_PROGRESS'),
          weightClass('w-2', 'Nam 65kg', 'NONE'),
          weightClass('w-3', 'Nữ 52kg', 'COMPLETED'),
        ]}
        counts={new Map([['w-1', 4]])}
        onSelect={vi.fn()}
        selectedId="w-1"
        unassignedCount={0}
      />,
    );
    const active = screen.getByRole('tab', { name: /Nam 61kg/ });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveAttribute('title', 'Đang thi đấu');
    expect(active).toHaveTextContent('Đang thi đấu: Nam 61kg');
    expect(screen.getByRole('tab', { name: /Nam 65kg/ })).toHaveAttribute('title', 'Chưa bốc thăm');
    expect(screen.getByRole('tab', { name: /Nữ 52kg/ })).toHaveAttribute('title', 'Hoàn tất');
    expect(screen.getByLabelText('Chú thích trạng thái hạng cân')).toBeInTheDocument();
  });

  it('omits dots and the legend when progress is unavailable', () => {
    render(
      <WeightClassMatchTabs
        classes={[weightClass('w-1', 'Nam 61kg')]}
        counts={new Map()}
        onSelect={vi.fn()}
        selectedId="w-1"
        unassignedCount={2}
      />,
    );
    expect(screen.getByRole('tab', { name: /Nam 61kg/ })).not.toHaveAttribute('title');
    expect(screen.getByRole('tab', { name: /Chưa xác định/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Chú thích trạng thái hạng cân')).not.toBeInTheDocument();
  });
});
