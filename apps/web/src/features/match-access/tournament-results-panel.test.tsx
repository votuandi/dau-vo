import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { TournamentResultsPanel } from './tournament-results-panel';

const api = vi.hoisted(() => ({
  tournamentResults: vi.fn(),
  announceTournamentResults: vi.fn(),
}));
vi.mock('@/services/api/official-access', () => ({ officialAccessApi: api }));
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));

const result = {
  bracketId: 'b-1',
  weightClass: { name: 'Nam 54kg' },
  finalMatchPublicId: 'FINAL1',
  champion: { name: 'Nhà vô địch', organization: 'CLB A', imagePath: null },
  completedAt: '2026-11-20T10:00:00.000Z',
  resultsAnnouncedAt: null,
};

describe('TournamentResultsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.announceTournamentResults.mockResolvedValue({ announcement: {} });
  });

  it('announces a finished weight class after confirmation', async () => {
    api.tournamentResults.mockResolvedValue({ results: [result] });
    renderWithQueryClient(<TournamentResultsPanel />);
    const item = (await screen.findByText('Nam 54kg')).closest('li') as HTMLElement;
    expect(item).toHaveTextContent('Vô địch: Nhà vô địch · CLB A');
    fireEvent.click(within(item).getByRole('button', { name: 'Công bố Kết quả giải đấu' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Tất cả bảng điểm của giải');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Công bố Kết quả giải đấu' }));
    await waitFor(() => {
      expect(api.announceTournamentResults).toHaveBeenCalledWith('b-1');
    });
  });

  it('offers to announce again once announced, and hides without finished finals', async () => {
    api.tournamentResults.mockResolvedValue({
      results: [{ ...result, resultsAnnouncedAt: '2026-11-20T10:05:00.000Z' }],
    });
    const { unmount } = renderWithQueryClient(<TournamentResultsPanel />);
    expect(await screen.findByRole('button', { name: 'Công bố lại' })).toBeVisible();
    expect(screen.getByText(/Đã công bố lúc/)).toBeVisible();
    unmount();

    api.tournamentResults.mockResolvedValue({ results: [] });
    const { container } = renderWithQueryClient(<TournamentResultsPanel />);
    await waitFor(() => {
      expect(api.tournamentResults).toHaveBeenCalledTimes(2);
    });
    expect(container).toBeEmptyDOMElement();
  });
});
