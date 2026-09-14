import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOfficialRole } from '@/types/shared';
import { TournamentOfficialsPage } from './tournament-officials-page';

const api = vi.hoisted(() => ({ createOfficial: vi.fn(), listOfficials: vi.fn() }));
vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));

function renderPage(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TournamentOfficialsPage
        readOnly={false}
        role={TournamentOfficialRole.REFEREE}
        tournamentId="tournament-1"
        tournamentPublicCode="GIAI-ABC9"
      />
    </QueryClientProvider>,
  );
}

describe('TournamentOfficialsPage credentials', () => {
  beforeEach(() => {
    api.listOfficials.mockResolvedValue({ officials: [] });
    api.createOfficial.mockResolvedValue({
      official: { id: 'official-1', name: 'Nguyễn A' },
      passcode: 'PRIVATE-123',
    });
  });

  it('separates the shared tournament code from the one-time private passcode', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm trọng tài' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Thêm trọng tài' }), {
      target: { value: 'Nguyễn A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Mã giải đấu')).toBeVisible();
    expect(screen.getByText('GIAI-ABC9')).toBeVisible();
    expect(screen.getByText('Mã bảo mật riêng')).toBeVisible();
    expect(screen.getByText('PRIVATE-123')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Đã lưu mã' }));
    expect(screen.queryByText('PRIVATE-123')).not.toBeInTheDocument();
  });
});
