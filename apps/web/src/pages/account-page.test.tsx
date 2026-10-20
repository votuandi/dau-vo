import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { AccountPage } from './account-page';

const user = {
  fullName: 'Nguyễn Văn A',
  id: 'user-id',
  isActive: true,
  role: 'USER' as const,
  username: 'nguyenvana',
};
const profile = {
  ...user,
  email: 'a@example.test',
  phone: '0900000001',
  organization: null,
  createdAt: '2026-10-20T00:00:00.000Z',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAccountPage(entitlementResponse: () => Response) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const url = input;
    if (url.endsWith('/subscriptions/me')) return Promise.resolve(entitlementResponse());
    if (url.endsWith('/auth/profile') && init?.method === 'PATCH')
      return Promise.resolve(
        json({ code: 'EMAIL_ALREADY_EXISTS', message: 'This email is already registered' }, 409),
      );
    if (url.endsWith('/auth/profile')) return Promise.resolve(json(profile));
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(authenticatedUserQueryKey, { user });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/account']}>
        <AccountPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountPage', () => {
  it('shows the profile and the membership notice for an empty entitlement body', async () => {
    // The API sends `null` as an empty 200 body for users without a package.
    renderAccountPage(() => new Response(null, { status: 200 }));

    expect(await screen.findByDisplayValue('a@example.test')).toBeVisible();
    expect(
      await screen.findByText(
        'Bạn chưa đăng ký gói thành viên. Hãy đăng ký để được sử dụng đầy đủ tính năng',
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Đăng ký gói' })).toHaveAttribute(
      'href',
      '/subscription',
    );
  });

  it('hides the membership notice for an active admin', async () => {
    renderAccountPage(() =>
      json({
        activeFrom: '2026-01-01T00:00:00.000Z',
        activeUntil: '2027-01-01T00:00:00.000Z',
        tournamentLimit: 5,
        usedTournamentQuota: 0,
        remainingTournamentQuota: 5,
        accessState: 'ACTIVE_ADMIN',
        readOnlyUntil: null,
      }),
    );

    expect(await screen.findByDisplayValue('a@example.test')).toBeVisible();
    expect(screen.queryByText(/Bạn chưa đăng ký gói thành viên/u)).not.toBeInTheDocument();
  });

  it('shows the membership notice when the package has expired', async () => {
    renderAccountPage(() =>
      json({
        activeFrom: '2025-01-01T00:00:00.000Z',
        activeUntil: '2026-01-01T00:00:00.000Z',
        tournamentLimit: 5,
        usedTournamentQuota: 1,
        remainingTournamentQuota: 4,
        accessState: 'EXPIRED_READ_ONLY',
        readOnlyUntil: '2027-01-01T00:00:00.000Z',
      }),
    );

    expect(await screen.findByText(/Bạn chưa đăng ký gói thành viên/u)).toBeVisible();
  });

  it('reports an email that is already registered on the email field', async () => {
    const fetchMock = renderAccountPage(() => new Response(null, { status: 200 }));
    const email = await screen.findByDisplayValue('a@example.test');
    fireEvent.change(email, { target: { value: 'taken@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Email này đã được đăng ký bởi tài khoản khác.')).toBeVisible();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ email: 'taken@example.test' });
  });
});
