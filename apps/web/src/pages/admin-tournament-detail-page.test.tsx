import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import { clearToasts } from '@/components/ui/toast';
import { TournamentStatus } from '@/types/shared';
import { AdminTournamentDetailPage } from './admin-tournament-detail-page';

const api = vi.hoisted(() => ({ getTournament: vi.fn(), updateTournament: vi.fn() }));
const access = vi.hoisted(() => ({ isReadOnly: false }));
let writeText = vi.fn();

vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));
vi.mock('@/features/auth/admin-access', () => ({
  useAdminAccessContext: () => access,
}));
vi.mock('@/features/tournament-officials/tournament-officials-page', () => ({
  TournamentOfficialsPage: () => <div />,
}));

const tournament = {
  createdAt: '2026-09-01T00:00:00.000Z',
  description: null,
  endDate: null,
  id: 'tournament-1',
  imagePath: null,
  location: null,
  name: 'Giải thử nghiệm',
  publicCode: 'GIAI-ABC9',
  sport: {
    code: 'VO',
    id: 'sport-1',
    isActive: true,
    name: 'Võ thuật',
    sportGroup: { code: 'MA', id: 'group-1', name: 'Võ' },
  },
  sportId: 'sport-1',
  startDate: null,
  status: TournamentStatus.ARCHIVED,
  allowLiveWatch: true,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function renderPage(path = '/admin/tournaments/tournament-1/judges'): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/admin/tournaments/:tournamentId/judges"
            element={<AdminTournamentDetailPage />}
          />
          <Route path="/admin/tournaments/:tournamentId" element={<AdminTournamentDetailPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('AdminTournamentDetailPage tournament login code', () => {
  beforeEach(() => {
    api.getTournament.mockResolvedValue({ tournament });
    access.isReadOnly = true;
    clearToasts();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });
  afterEach(() => {
    clearToasts();
  });

  it('shows and copies the exact public code in a read-only archived tournament', async () => {
    renderPage();
    expect(await screen.findByText('GIAI-ABC9')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã đăng nhập giải đấu' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('GIAI-ABC9');
    });
    expect(await screen.findByText('Đã sao chép mã giải đấu.')).toBeVisible();
  });

  it('reports clipboard failures instead of silently ignoring them', async () => {
    writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    await screen.findByText('GIAI-ABC9');
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép mã đăng nhập giải đấu' }));
    expect(
      await screen.findByText('Không thể sao chép mã. Vui lòng sao chép thủ công.'),
    ).toBeVisible();
  });
});

describe('AdminTournamentDetailPage live watch setting', () => {
  beforeEach(() => {
    access.isReadOnly = false;
    api.getTournament.mockResolvedValue({
      tournament: { ...tournament, status: TournamentStatus.ACTIVE },
    });
    api.updateTournament.mockImplementation((_id: string, input: object) =>
      Promise.resolve({ tournament: { ...tournament, ...input } }),
    );
  });

  it('treats a tournament without the setting as allowing live watching', async () => {
    api.getTournament.mockResolvedValue({
      tournament: { ...tournament, allowLiveWatch: undefined, status: TournamentStatus.ACTIVE },
    });
    renderPage('/admin/tournaments/tournament-1');
    expect(
      await screen.findByRole('switch', { name: 'Cho phép theo dõi trực tiếp' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shows "Cho phép theo dõi trực tiếp" on by default and saves it when turned off', async () => {
    renderPage('/admin/tournaments/tournament-1');
    const toggle = await screen.findByRole('switch', { name: 'Cho phép theo dõi trực tiếp' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => {
      expect(api.updateTournament).toHaveBeenCalledWith(
        'tournament-1',
        expect.objectContaining({ allowLiveWatch: false }),
      );
    });
  });
});
