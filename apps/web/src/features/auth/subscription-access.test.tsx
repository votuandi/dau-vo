import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppLayout } from '@/layouts/app-layout';
import { authenticatedUserQueryKey } from './authenticated-user-session';
import { SubscriptionRouteGuard } from './subscription-route-guard';

const superAdminSession = {
  user: {
    fullName: 'System Administrator',
    id: 'super-admin-id',
    isActive: true,
    role: 'SUPER_ADMIN' as const,
    username: 'superadmin',
  },
};

function renderForSuperAdmin(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(authenticatedUserQueryKey, superAdminSession);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/subscription']}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SUPER_ADMIN subscription access', () => {
  it('does not display the subscription navigation item', () => {
    renderForSuperAdmin(
      <Routes>
        <Route element={<AppLayout />} path="/">
          <Route element={<p>Page content</p>} path="subscription" />
        </Route>
      </Routes>,
    );

    expect(screen.queryByRole('link', { name: 'Gói đăng ký' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quản trị hệ thống' })).toBeVisible();
  });

  it('redirects away before the subscription page can render', async () => {
    renderForSuperAdmin(
      <Routes>
        <Route element={<SubscriptionRouteGuard />}>
          <Route element={<p>Subscription page</p>} path="/subscription" />
        </Route>
        <Route element={<p>Super admin home</p>} path="/super-admin" />
      </Routes>,
    );

    expect(await screen.findByText('Super admin home')).toBeVisible();
    expect(screen.queryByText('Subscription page')).not.toBeInTheDocument();
  });
});
