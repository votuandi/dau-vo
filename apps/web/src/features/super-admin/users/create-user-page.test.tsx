import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn().mockResolvedValue({ id: 'created-user' }),
}));

vi.mock('@/services/api/super-admin', () => ({
  superAdminApi: api,
}));

import { CreateSuperAdminUserPage } from './create-user-page';

describe('CreateSuperAdminUserPage', () => {
  it('submits ADMIN creation once with initial access instead of activating separately', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CreateSuperAdminUserPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText('Họ và tên'), 'Initial Admin');
    await user.type(screen.getByLabelText('Tên đăng nhập'), 'initial-admin');
    await user.type(screen.getByLabelText('Email'), 'initial@example.test');
    await user.type(screen.getByLabelText('Số điện thoại'), '0900000018');
    await user.type(screen.getByLabelText('Mật khẩu', { exact: true }), 'Aa1!Aa1!');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'Aa1!Aa1!');
    await user.click(screen.getByLabelText('ADMIN'));
    await user.type(screen.getByLabelText('Hết hạn quyền quản trị'), '2030-12-31');
    await user.type(screen.getByLabelText('Giới hạn giải đấu'), '2');
    await user.click(screen.getByRole('button', { name: 'Tạo người dùng' }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledOnce();
    });
    expect(JSON.stringify(api.create.mock.calls)).toContain('"initialAdminAccess"');
    expect(JSON.stringify(api.create.mock.calls)).toContain('"tournamentLimit":2');
    expect(api.access).not.toHaveBeenCalled();
  });

  it('does not submit an over-byte-limit password', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CreateSuperAdminUserPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.type(screen.getByLabelText('Mật khẩu', { exact: true }), '😀'.repeat(19));
    await user.click(screen.getByRole('button', { name: 'Tạo người dùng' }));
    expect(await screen.findByText('Mật khẩu không được vượt quá 72 byte UTF-8.')).toBeVisible();
    expect(api.create).not.toHaveBeenCalled();
  });
});
