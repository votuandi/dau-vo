import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import { clearToasts } from '@/components/ui/toast';
import { ApiClientError } from '@/services/api/client';
import { AthletesPage } from './athletes-page';

const api = vi.hoisted(() => ({
  listAthletes: vi.fn(),
  listWeightClasses: vi.fn(),
  listOrganizations: vi.fn(),
  createAthlete: vi.fn(),
  updateAthlete: vi.fn(),
  replaceAthleteImage: vi.fn(),
}));

vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));

afterEach(clearToasts);

describe('athlete image upload failure', () => {
  it('shows the backend reason, preserves its cause, and retries without creating another athlete', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const athlete = { id: 'athlete-1', name: 'Nguyễn An', weightClassId: 'weight-1' };
    api.listAthletes.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
    api.listWeightClasses.mockResolvedValue({
      weightClasses: [{ id: 'weight-1', name: '50 kg', isActive: true, hasCurrentBracket: false }],
    });
    api.listOrganizations.mockResolvedValue({ organizations: [] });
    api.createAthlete.mockResolvedValue({ athlete });
    api.updateAthlete.mockResolvedValue({ athlete });
    const uploadError = new ApiClientError(400, {
      code: 'IMAGE_INVALID_CONTENT',
      message: 'Image content is invalid',
    });
    api.replaceAthleteImage.mockRejectedValueOnce(uploadError).mockResolvedValueOnce({
      imagePath: 'athletes/image.webp',
      imageUrl: '/api/media/athletes/image.webp',
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <AthletesPage readOnly={false} tournamentId="tournament-1" />
          <Toaster />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm vận động viên' }));
    fireEvent.change(screen.getByLabelText('Tên vận động viên'), {
      target: { value: athlete.name },
    });
    const file = new File(['image'], 'athlete.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Ảnh đại diện/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vận động viên đã được tạo, nhưng tải ảnh thất bại. Không thể đọc ảnh.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('16 megapixel');
    expect(consoleError).toHaveBeenCalledWith(
      'Admin mutation failed',
      expect.objectContaining({ cause: uploadError }),
    );
    expect(screen.getByRole('form', { name: 'Sửa vận động viên' })).toBeVisible();
    expect(screen.getByLabelText('Tên vận động viên')).toHaveValue(athlete.name);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Sửa vận động viên' })).not.toBeInTheDocument();
    });
    expect(api.createAthlete).toHaveBeenCalledTimes(1);
    expect(api.updateAthlete).toHaveBeenCalledWith('tournament-1', athlete.id, expect.any(Object));
    expect(api.replaceAthleteImage).toHaveBeenNthCalledWith(2, 'tournament-1', athlete.id, file);
  });
});
