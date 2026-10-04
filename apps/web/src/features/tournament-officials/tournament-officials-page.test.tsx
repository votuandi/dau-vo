import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOfficialRole } from '@/types/shared';
import { TournamentOfficialsPage } from './tournament-officials-page';

const api = vi.hoisted(() => ({ createOfficial: vi.fn(), listOfficials: vi.fn() }));
vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));

function renderPage(role = TournamentOfficialRole.JUDGE, readOnly = false): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TournamentOfficialsPage
        readOnly={readOnly}
        role={role}
        tournamentId="tournament-1"
        tournamentPublicCode="GIAI-ABC9"
      />
    </QueryClientProvider>,
  );
}

describe('TournamentOfficialsPage credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listOfficials.mockResolvedValue({ officials: [] });
    api.createOfficial.mockResolvedValue({
      official: { id: 'official-1', name: 'Nguyễn A' },
      passcode: 'PRIVATE-123',
    });
  });

  it.each([
    [TournamentOfficialRole.JUDGE, 'Giám định'],
    [TournamentOfficialRole.SUPERVISOR, 'Giám sát'],
  ])('quickly creates numbered officials for %s and keeps their passcodes', async (role, label) => {
    api.listOfficials.mockResolvedValue({
      officials: [{ id: 'existing', name: `${label} 001`, role, status: 'READY' }],
    });
    renderPage(role);
    const quickButton = await screen.findByRole('button', { name: 'Thêm nhanh' });
    await waitFor(() => expect(quickButton).toBeEnabled());
    fireEvent.click(quickButton);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Số lượng' }), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => {
      expect(api.createOfficial).toHaveBeenCalledTimes(2);
    });
    expect(api.createOfficial).toHaveBeenNthCalledWith(1, 'tournament-1', {
      role,
      name: `${label} 002`,
    });
    expect(api.createOfficial).toHaveBeenNthCalledWith(2, 'tournament-1', {
      role,
      name: `${label} 003`,
    });
    expect(await screen.findByRole('button', { name: 'Đã lưu mã' })).toBeEnabled();
    expect(screen.getAllByText('PRIVATE-123')).toHaveLength(2);
  });

  it('rejects invalid quantities and allows cancelling', async () => {
    renderPage();
    const quickButton = await screen.findByRole('button', { name: 'Thêm nhanh' });
    await waitFor(() => expect(quickButton).toBeEnabled());
    fireEvent.click(quickButton);
    for (const value of ['0', '-1', '1.5', '']) {
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Số lượng' }), { target: { value } });
      expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createOfficial).not.toHaveBeenCalled();
  });

  it('preserves successful credentials if a later creation fails', async () => {
    api.createOfficial
      .mockResolvedValueOnce({ passcode: 'FIRST-CODE' })
      .mockRejectedValueOnce(new Error('Creation failed'));
    renderPage();
    const quickButton = await screen.findByRole('button', { name: 'Thêm nhanh' });
    await waitFor(() => expect(quickButton).toBeEnabled());
    fireEvent.click(quickButton);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Số lượng' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByText('FIRST-CODE')).toBeVisible();
    expect(api.createOfficial).toHaveBeenCalledTimes(2);
  });

  it('hides quick creation in read-only mode', async () => {
    renderPage(TournamentOfficialRole.JUDGE, true);
    await screen.findByText('Chưa có giám định.');
    expect(screen.queryByRole('button', { name: 'Thêm nhanh' })).not.toBeInTheDocument();
  });

  it('separates the shared tournament code from the one-time private passcode', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm giám định' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Thêm giám định' }), {
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
