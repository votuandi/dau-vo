import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { adminManagementApi } from '@/services/api/admin-management';
import { AthletesPage } from './tournament-roster-tabs';

vi.mock('@/services/api/admin-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/admin-management')>();
  return {
    ...actual,
    adminManagementApi: {
      ...actual.adminManagementApi,
      listAthletes: vi.fn(),
      listWeightClasses: vi.fn(),
      listOrganizations: vi.fn(),
    },
  };
});

function Location() {
  return <output aria-label="URL">{useLocation().search}</output>;
}

function renderPage(page: number) {
  vi.mocked(adminManagementApi.listAthletes).mockImplementation((_id, input) =>
    Promise.resolve({ items: [], page: input.page ?? 1, pageSize: 25, total: 250, totalPages: 10 }),
  );
  vi.mocked(adminManagementApi.listWeightClasses).mockResolvedValue({ weightClasses: [] });
  vi.mocked(adminManagementApi.listOrganizations).mockResolvedValue({ organizations: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[`/?page=${String(page)}`]}>
      <QueryClientProvider client={client}>
        <AthletesPage readOnly tournamentId="t1" />
        <Location />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Athlete pagination', () => {
  it('requests the selected page and keeps it after the search debounce interval', async () => {
    renderPage(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Trang 3' }));
    await waitFor(() => {
      expect(adminManagementApi.listAthletes).toHaveBeenLastCalledWith(
        't1',
        expect.objectContaining({ page: 3 }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(screen.getByLabelText('URL')).toHaveTextContent('?page=3');
    expect(screen.getByRole('button', { name: 'Trang 3' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => {
      expect(adminManagementApi.listAthletes).toHaveBeenLastCalledWith(
        't1',
        expect.objectContaining({ page: 4 }),
      );
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Trang cuối' }));
    await waitFor(() => {
      expect(screen.getByLabelText('URL')).toHaveTextContent('?page=10');
      expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    });
  });

  it('preserves a page from the URL and still resets pagination when a filter changes', async () => {
    renderPage(3);
    await screen.findByRole('button', { name: 'Trang 3' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(screen.getByLabelText('URL')).toHaveTextContent('?page=3');
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'true' } });
    await waitFor(() => {
      expect(adminManagementApi.listAthletes).toHaveBeenLastCalledWith(
        't1',
        expect.objectContaining({ page: 1, isActive: true }),
      );
    });
  });
});
