import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

describe('AthletesPage add-athlete availability', () => {
  it('warns when every active weight class already has a bracket', async () => {
    vi.mocked(adminManagementApi.listAthletes).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    });
    vi.mocked(adminManagementApi.listWeightClasses).mockResolvedValue({
      weightClasses: [
        {
          bracketProgress: 'DRAWN',
          createdAt: '2026-09-01T00:00:00.000Z',
          details: null,
          hasCurrentBracket: true,
          id: 'w1',
          intermissionDurationSeconds: 30,
          isActive: true,
          name: 'Dưới 50kg',
          tournamentId: 't1',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(adminManagementApi.listOrganizations).mockResolvedValue({ organizations: [] });
    render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AthletesPage readOnly={false} tournamentId="t1" />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const message = await screen.findByText(
      'Không thể thêm vận động viên vì tất cả hạng cân đang hoạt động đã được chia nhánh đấu.',
    );
    expect(message.closest('[data-tone]')).toHaveAttribute('data-tone', 'warning');
  });
});
