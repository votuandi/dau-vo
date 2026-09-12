import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import { clearToasts } from '@/components/ui/toast';
import { ApiClientError } from '@/services/api/client';
import { adminManagementApi, type TournamentRosterItem } from '@/services/api/admin-management';
import { RosterItemsPage } from './tournament-roster-tabs';

vi.mock('@/services/api/admin-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/admin-management')>();
  return {
    ...actual,
    adminManagementApi: {
      ...actual.adminManagementApi,
      listOrganizations: vi.fn(),
      listWeightClasses: vi.fn(),
      createOrganization: vi.fn(),
      createWeightClass: vi.fn(),
      updateOrganization: vi.fn(),
      updateWeightClass: vi.fn(),
      deleteOrganization: vi.fn(),
      deleteWeightClass: vi.fn(),
    },
  };
});

type RosterApiMethod =
  | 'listOrganizations'
  | 'listWeightClasses'
  | 'createOrganization'
  | 'createWeightClass'
  | 'updateOrganization'
  | 'updateWeightClass'
  | 'deleteOrganization'
  | 'deleteWeightClass';

const api = adminManagementApi as unknown as Record<RosterApiMethod, ReturnType<typeof vi.fn>>;

const first: TournamentRosterItem = {
  id: 'one',
  tournamentId: 't1',
  name: '  First  ',
  details: 'first details',
  isActive: true,
  createdAt: '',
  updatedAt: '',
};
const second: TournamentRosterItem = {
  id: 'two',
  tournamentId: 't1',
  name: 'Second',
  details: 'second details',
  isActive: false,
  createdAt: '',
  updatedAt: '',
};

function renderPage({ items = [first, second], readOnly = false } = {}) {
  api.listOrganizations.mockResolvedValue({ organizations: items });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <RosterItemsPage kind="organizations" readOnly={readOnly} tournamentId="t1" />
      <Toaster />
    </QueryClientProvider>,
  );
  return { invalidate };
}

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Thêm đơn vị' }));
}

async function editButton(index: number): Promise<HTMLButtonElement> {
  const buttons = await screen.findAllByRole('button', { name: 'Sửa' });
  const button = buttons[index] as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Missing edit button ${String(index)}.`);
  return button;
}

afterEach(() => {
  vi.clearAllMocks();
  clearToasts();
});

describe('RosterItemsPage', () => {
  it('starts a create form empty, trims input, and clears it after success', async () => {
    const user = userEvent.setup();
    api.createOrganization.mockResolvedValue({});
    renderPage();
    await openCreate(user);
    const name = screen.getByLabelText('Tên');
    expect(name).toHaveValue('');
    await user.type(name, '  New organization  ');
    await user.type(screen.getByLabelText('Chi tiết'), '  Details  ');
    await user.click(screen.getByRole('button', { name: 'Thêm mới' }));
    await waitFor(() => {
      expect(api.createOrganization).toHaveBeenCalledWith('t1', {
        name: 'New organization',
        details: 'Details',
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Thêm đơn vị' })).toBeVisible();
    });
  });

  it('hydrates each selected row and replaces every value when switching rows', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await editButton(0));
    expect(screen.getByLabelText('Tên')).toHaveValue('  First  ');
    expect(screen.getByLabelText('Chi tiết')).toHaveValue('first details');
    await user.click(await editButton(1));
    expect(screen.getByLabelText('Tên')).toHaveValue('Second');
    expect(screen.getByLabelText('Chi tiết')).toHaveValue('second details');
  });

  it('cancels editing without a mutation and clears the draft', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await editButton(0));
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(api.updateOrganization).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Tên')).not.toBeInTheDocument();
  });

  it('keeps failed updates for correction and shows the mapped error', async () => {
    const user = userEvent.setup();
    api.updateOrganization.mockRejectedValue(
      new ApiClientError(409, { code: 'ORGANIZATION_NAME_ALREADY_EXISTS' }),
    );
    renderPage();
    await user.click(await editButton(0));
    await user.clear(screen.getByLabelText('Tên'));
    await user.type(screen.getByLabelText('Tên'), 'Changed');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Đã có đơn vị tham gia cùng tên');
    });
    expect(screen.getByLabelText('Tên')).toHaveValue('Changed');
  });

  it('requires confirmation before status changes and invalidates tournament queries', async () => {
    const user = userEvent.setup();
    api.deleteOrganization.mockResolvedValue({});
    const { invalidate } = renderPage();
    const deactivateButton = (await screen.findAllByRole('button', { name: 'Ngừng dùng' }))[0];
    if (!deactivateButton) throw new Error('Missing deactivate button.');
    await user.click(deactivateButton);
    expect(api.deleteOrganization).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xác nhận ngừng dùng' }));
    await waitFor(() => {
      expect(api.deleteOrganization).toHaveBeenCalledWith('t1', 'one');
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'tournaments', 't1'] });
    });
  });

  it('hides mutation actions in read-only mode', async () => {
    renderPage({ readOnly: true });
    await screen.findByText('First');
    expect(
      screen.queryByRole('button', { name: /Thêm đơn vị|Sửa|Ngừng dùng|Khôi phục/u }),
    ).not.toBeInTheDocument();
  });

  it('uses the structured weight-class-in-use code for actionable guidance', async () => {
    const user = userEvent.setup();
    api.listWeightClasses.mockResolvedValue({ weightClasses: [first] });
    api.deleteWeightClass.mockRejectedValue(
      new ApiClientError(409, { code: 'WEIGHT_CLASS_IN_USE' }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RosterItemsPage kind="weight-classes" readOnly={false} tournamentId="t1" />
        <Toaster />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole('button', { name: 'Ngừng dùng' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận ngừng dùng' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Hãy chuyển các vận động viên hoặc trận liên quan trước khi ngừng dùng.',
      );
    });
  });

  it('does not submit twice while the create mutation is pending', async () => {
    const user = userEvent.setup();
    let resolve: (() => void) | undefined;
    api.createOrganization.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    renderPage();
    await openCreate(user);
    await user.type(screen.getByLabelText('Tên'), 'Pending');
    fireEvent.submit(screen.getByRole('form'));
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => {
      expect(api.createOrganization).toHaveBeenCalledTimes(1);
    });
    if (!resolve) throw new Error('Expected pending mutation resolver.');
    resolve();
  });
});
