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
    adUrl: null,
    tier: 1,
    tierName: 'Kim cương',
    displayIndex: 1,
    isEnabled: true,
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
          isEnabled: false,
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
    fireEvent.click(within(form).getByRole('switch', { name: 'Đang tài trợ' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Thêm mới' }));
    await waitFor(() => {
      expect(api.createSponsor).toHaveBeenCalledWith('tournament-1', {
        name: 'New Co',
        details: 'Đồng hành cùng giải',
        adUrl: null,
        tier: 2,
        tierName: 'Vàng',
        displayIndex: 4,
        isEnabled: false,
      });
    });
  });

  it('validates the advertising link and saves it as a full https address', async () => {
    renderPage();
    await screen.findAllByRole('listitem');
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhà tài trợ/ }));
    const form = screen.getByRole('form', { name: 'Thêm nhà tài trợ' });
    fireEvent.change(within(form).getByLabelText('Tên'), { target: { value: 'Ads Co' } });
    fireEvent.change(within(form).getByLabelText('Tên bậc tài trợ'), {
      target: { value: 'Vàng' },
    });
    const link = within(form).getByLabelText(/Link quảng cáo/);
    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } });
    expect(link).toHaveAttribute('aria-invalid', 'true');
    expect(within(form).getByRole('alert')).toHaveTextContent('http:// hoặc https://');
    expect(within(form).getByRole('button', { name: 'Thêm mới' })).toBeDisabled();

    fireEvent.change(link, { target: { value: 'nhataitro.vn/khuyen-mai' } });
    expect(link).toHaveAttribute('aria-invalid', 'false');
    fireEvent.click(within(form).getByRole('button', { name: 'Thêm mới' }));
    await waitFor(() => {
      expect(api.createSponsor).toHaveBeenCalledWith(
        'tournament-1',
        expect.objectContaining({ adUrl: 'https://nhataitro.vn/khuyen-mai' }),
      );
    });
  });

  it('explains, without blocking, that a taken position reorders the others', async () => {
    renderPage();
    const first = item(await screen.findAllByRole('listitem'), 0);
    fireEvent.click(within(first).getByRole('button', { name: 'Sửa' }));
    const form = screen.getByRole('form', { name: 'Chỉnh sửa nhà tài trợ' });
    const position = within(form).getByLabelText(/Vị trí xuất hiện/);
    fireEvent.change(position, { target: { value: '3' } });
    expect(position).toHaveAccessibleDescription(
      'Vị trí xuất hiện này đã được nhà tài trợ Silver Co sử dụng. Thay đổi này sẽ làm thay đổi vị trí của các Nhà tài trợ khác.',
    );
    expect(within(form).queryByRole('alert')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => {
      expect(api.updateSponsor).toHaveBeenCalledWith(
        'tournament-1',
        'sponsor-1',
        expect.objectContaining({ displayIndex: 3 }),
      );
    });
  });

  it('shows no reorder notice for the sponsor’s own position', async () => {
    renderPage();
    const first = item(await screen.findAllByRole('listitem'), 0);
    fireEvent.click(within(first).getByRole('button', { name: 'Sửa' }));
    const form = screen.getByRole('form', { name: 'Chỉnh sửa nhà tài trợ' });
    expect(within(form).getByLabelText(/Vị trí xuất hiện/)).toHaveAccessibleDescription(
      'Thứ tự hiển thị trong danh sách.',
    );
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

  it('shows drag handles only while the list can be reordered', async () => {
    renderPage();
    await screen.findAllByRole('listitem');
    expect(screen.getByRole('button', { name: 'Kéo để đổi vị trí Gold Co' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Kéo để đổi vị trí Silver Co' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Thêm nhà tài trợ/ }));
    expect(screen.queryByRole('button', { name: /Kéo để đổi vị trí/ })).toBeNull();
  });

  it('hides editing actions when read-only', async () => {
    renderPage(true);
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: /Thêm nhà tài trợ/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Kéo để đổi vị trí/ })).toBeNull();
  });
});
