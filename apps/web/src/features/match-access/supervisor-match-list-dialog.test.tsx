import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SupervisorConsole } from './supervisor-console';
import { createRealtimeState } from '@/test/factories';
import { officialAccessApi } from '@/services/api/official-access';

it('opens the match list from the console and closes it with Escape', async () => {
  vi.spyOn(officialAccessApi, 'matches').mockResolvedValue({ matches: [] });
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SupervisorConsole realtime={createRealtimeState()} />
    </QueryClientProvider>,
  );
  const button = screen.getByRole('button', { name: 'Danh sách trận' });
  await user.click(button);
  expect(screen.getByRole('dialog', { name: 'Danh sách trận' })).toBeInTheDocument();
  expect(await screen.findByText('Chưa có trận đấu.')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(button).toHaveFocus();
  vi.restoreAllMocks();
});

it('pins the current match and filters by athlete name and weight class', async () => {
  const { MatchLifecycle, MatchStatus } = await import('@/types/shared');
  const { SupervisorMatchListDialog } = await import('./supervisor-match-list-dialog');
  vi.spyOn(officialAccessApi, 'matches').mockResolvedValue({
    matches: [
      {
        id: 'other',
        publicId: 'M02',
        lifecycle: MatchLifecycle.READY,
        status: MatchStatus.WAITING,
        requiredJudgeCount: 3,
        claimable: true,
        athletes: [{ color: 'RED', name: 'Nguyễn Văn An' }],
        weightClass: { id: '60', name: '60 kg' },
      },
      {
        id: 'current',
        publicId: 'M01',
        lifecycle: MatchLifecycle.IN_PROGRESS,
        status: MatchStatus.ROUND_1_RUNNING,
        requiredJudgeCount: 3,
        claimable: false,
        athletes: [{ color: 'BLUE', name: 'Trần Bình' }],
        weightClass: { id: '70', name: '70 kg' },
      },
    ],
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SupervisorMatchListDialog currentId="M01" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText('Đang điều khiển');
  expect(screen.getAllByRole('article')[0]).toHaveAttribute('aria-current', 'true');
  await user.type(screen.getByRole('textbox', { name: 'Tìm trận đấu' }), 'nguyen');
  expect(screen.getByRole('article', { name: 'Trận M02' })).toBeVisible();
  expect(screen.queryByRole('article', { name: 'Trận M01' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Lọc hạng cân' }), '70');
  expect(screen.getByText('Không tìm thấy trận phù hợp.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  vi.restoreAllMocks();
});
