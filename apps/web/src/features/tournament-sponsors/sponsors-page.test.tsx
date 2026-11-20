import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TournamentSponsor } from '@/services/api/admin-management';
import { SponsorsPage } from './sponsors-page';

const api = vi.hoisted(() => ({
  listSponsors: vi.fn(),
  createSponsor: vi.fn(),
  updateSponsor: vi.fn(),
  deleteSponsor: vi.fn(),
  replaceSponsorImage: vi.fn(),
}));
vi.mock('@/services/api/admin-management', () => ({ adminManagementApi: api }));

function sponsor(overrides: Partial<TournamentSponsor>): TournamentSponsor {
  return {
    id: 'sponsor-1',
    tournamentId: 'tournament-1',
    name: 'Gold Co',
    details: null,
    imagePath: null,
    tier: 1,
    tierName: 'Kim cương',
    displayIndex: 1,
    isDisabled: false,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function item(items: readonly HTMLElement[], index: number): HTMLElement {
  const element = items[index];
  if (!element) throw new Error(`Missing list item ${String(index)}`);
  return element;
}

function renderPage(readOnly = false): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SponsorsPage readOnly={readOnly} tournamentId="tournament-1" />
    </QueryClientProvider>,
  );
}

describe('SponsorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listSponsors.mockResolvedValue({
      sponsors: [
        sponsor({}),
        sponsor({
          id: 'sponsor-2',
          name: 'Silver Co',
          tier: 2,
          tierName: 'Bạc',
          displayIndex: 3,
          isDisabled: true,
        }),
      ],
    });
    api.createSponsor.mockResolvedValue({ sponsor: sponsor({ id: 'new' }) });
    api.updateSponsor.mockResolvedValue({ sponsor: sponsor({}) });
    api.deleteSponsor.mockResolvedValue({ sponsor: sponsor({}) });
  });

  it('lists sponsors with tier, position and disabled state', async () => {
    renderPage();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(item(items, 0)).getByText('Bậc 1 · Kim cương')).toBeVisible();
    expect(within(item(items, 0)).getByLabelText('Vị trí xuất hiện 1')).toBeVisible();
    expect(within(item(items, 1)).getByText('Ngừng tài trợ', { selector: 'span' })).toBeVisible();
    expect(within(item(items, 1)).getByRole('button', { name: 'Tài trợ lại' })).toBeVisible();
  });

  it('creates a sponsor with the next free position by default', async () => {
    renderPage();
    await screen.findAllByRole('listitem');
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhà tài trợ/ }));
    const form = screen.getByRole('form', { name: 'Thêm nhà tài trợ' });
    expect(within(form).getByLabelText(/Vị trí xuất hiện/)).toHaveValue(4);
    fireEvent.change(within(form).getByLabelText('Tên'), { target: { value: ' New Co ' } });
    fireEvent.change(within(form).getByLabelText(/Bậc tài trợ/, { selector: '[type=number]' }), {
      target: { value: '2' },
    });
    fireEvent.change(within(form).getByLabelText('Tên bậc tài trợ'), {
      target: { value: 'Vàng' },
    });
    fireEvent.change(within(form).getByLabelText('Thông tin chi tiết'), {
      target: { value: 'Đồng hành cùng giải' },
    });
    fireEvent.click(within(form).getByRole('switch', { name: 'Ngừng tài trợ' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Thêm mới' }));
    await waitFor(() => {
      expect(api.createSponsor).toHaveBeenCalledWith('tournament-1', {
        name: 'New Co',
        details: 'Đồng hành cùng giải',
        tier: 2,
        tierName: 'Vàng',
        displayIndex: 4,
        isDisabled: true,
      });
    });
  });

  it('blocks a display position already used by another sponsor', async () => {
    renderPage();
    const first = item(await screen.findAllByRole('listitem'), 0);
    fireEvent.click(within(first).getByRole('button', { name: 'Sửa' }));
    const form = screen.getByRole('form', { name: 'Chỉnh sửa nhà tài trợ' });
    const position = within(form).getByLabelText(/Vị trí xuất hiện/);
    fireEvent.change(position, { target: { value: '3' } });
    expect(within(form).getByRole('alert')).toHaveTextContent('đã được nhà tài trợ khác sử dụng');
    expect(within(form).getByRole('button', { name: 'Lưu' })).toBeDisabled();
    // Its own position is not a conflict.
    fireEvent.change(position, { target: { value: '1' } });
    expect(within(form).getByRole('button', { name: 'Lưu' })).toBeEnabled();
  });

  it('soft deletes a sponsor after confirmation', async () => {
    renderPage();
    const first = item(await screen.findAllByRole('listitem'), 0);
    fireEvent.click(within(first).getByRole('button', { name: 'Xóa' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xóa nhà tài trợ' }));
    await waitFor(() => {
      expect(api.deleteSponsor).toHaveBeenCalledWith('tournament-1', 'sponsor-1');
    });
  });

  it('hides editing actions when read-only', async () => {
    renderPage(true);
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: /Thêm nhà tài trợ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
  });
});
