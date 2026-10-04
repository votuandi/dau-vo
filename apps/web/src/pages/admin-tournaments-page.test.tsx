import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminTournamentsPage } from './admin-tournaments-page';

const api = vi.hoisted(() => ({
  listTournaments: vi.fn(),
  listSports: vi.fn(),
  createTournament: vi.fn(),
  replaceTournamentImage: vi.fn(),
  archiveTournament: vi.fn(),
}));

vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));
vi.mock('@/features/auth/admin-access', () => ({
  useAdminAccessContext: () => ({ isReadOnly: false }),
}));

describe('tournament creation logo', () => {
  beforeEach(() => {
    api.listTournaments.mockResolvedValue({ tournaments: [] });
    api.listSports.mockResolvedValue([
      { id: 'sport-1', name: 'Karate', sportGroup: { name: 'Võ thuật' } },
    ]);
    api.createTournament.mockResolvedValue({ tournament: { id: 'tournament-1' } });
    api.replaceTournamentImage.mockResolvedValue({ imagePath: 'tournaments/logo.png' });
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:logo');
        static override revokeObjectURL = vi.fn();
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  async function fillForm() {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/admin/tournaments']}>
          <Routes>
            <Route path="/admin/tournaments" element={<AdminTournamentsPage />} />
            <Route path="/admin/tournaments/:id" element={<p>Tournament details</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('option', { name: 'Karate — Võ thuật' });
    fireEvent.change(screen.getByLabelText('Môn thể thao'), { target: { value: 'sport-1' } });
    fireEvent.change(screen.getByLabelText('Tên giải đấu'), { target: { value: 'Giải Karate' } });
  }

  it('uploads the selected file before navigating, without a separate upload click', async () => {
    await fillForm();
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Logo giải đấu/), { target: { files: [file] } });
    expect(screen.queryByRole('button', { name: 'Tải logo lên' })).not.toBeInTheDocument();
    let finishUpload!: (value: { imagePath: string }) => void;
    api.replaceTournamentImage.mockReturnValue(
      new Promise((resolve) => {
        finishUpload = resolve;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tạo giải đấu' }));
    await waitFor(() => {
      expect(api.replaceTournamentImage).toHaveBeenCalledWith('tournament-1', file);
    });
    expect(screen.queryByText('Tournament details')).not.toBeInTheDocument();
    finishUpload({ imagePath: 'tournaments/logo.png' });
    expect(await screen.findByText('Tournament details')).toBeVisible();
  });

  it('still creates tournaments without an optional logo', async () => {
    await fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo giải đấu' }));
    expect(await screen.findByText('Tournament details')).toBeVisible();
    expect(api.replaceTournamentImage).not.toHaveBeenCalled();
  });
});
