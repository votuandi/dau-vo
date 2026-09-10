import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminMatchMonitoring } from './admin-match-monitoring';

const adminManagementApiMock = vi.hoisted(() => ({
  getMatchMonitoring: vi.fn(),
}));

vi.mock('@/services/api/admin-management', () => ({
  adminManagementApi: adminManagementApiMock,
}));

describe('AdminMatchMonitoring', () => {
  it('renders the loading state before the monitoring snapshot arrives', () => {
    adminManagementApiMock.getMatchMonitoring.mockReturnValue(new Promise(() => undefined));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AdminMatchMonitoring matchId="a92bbb35-3fa2-4e52-9749-ad16b4e659cc" />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Đang tải trạng thái trận đấu…')).toBeVisible();
  });
});
