import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchRole } from '@martial-arts-scoring/shared-types';
import { MatchAccessPage } from './match-access-page';
import { ApiClientError } from '@/services/api/client';
import { inspectorSession, refereeSession } from '@/test/factories';

const matchAccessApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
  takeover: vi.fn(),
}));

vi.mock('@/services/api/match-access', () => ({
  matchAccessApi: matchAccessApiMock,
}));

vi.mock('@/features/match-access/match-realtime', () => ({
  useMatchRealtime: vi.fn(() => ({})),
}));

vi.mock('@/features/match-access/referee-console', () => ({
  RefereeConsole: () => <div>Referee console ready</div>,
}));

vi.mock('@/features/match-access/inspector-console', () => ({
  InspectorConsole: () => <div>Inspector console ready</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage(expectedRole = MatchRole.REFEREE) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[expectedRole === MatchRole.REFEREE ? '/trong-tai' : '/giam-dinh']}
      >
        <MatchAccessPage expectedRole={expectedRole} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillLoginForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(await screen.findByLabelText('Mã trận đấu'), 'a72k9p');
  await user.type(await screen.findByLabelText('Mã bảo mật'), 'REFEREE-CODE');
}

function storedDeviceId(): string {
  const deviceId = window.localStorage.getItem('martial-arts-scoring.match-access.device-id');
  if (deviceId === null) {
    throw new Error('The login page did not create a browser device identifier.');
  }

  return deviceId;
}

describe('MatchAccessPage referee login', () => {
  beforeEach(() => {
    matchAccessApiMock.login.mockReset();
    matchAccessApiMock.logout.mockReset();
    matchAccessApiMock.session.mockReset();
    matchAccessApiMock.takeover.mockReset();
    matchAccessApiMock.session.mockRejectedValue(new ApiClientError(401, {}));
    window.localStorage.clear();
  });

  it('logs in with normalized credentials, persists safe match metadata, and navigates to the referee route', async () => {
    const user = userEvent.setup();
    matchAccessApiMock.login.mockResolvedValue({ session: refereeSession });
    renderPage();

    await fillLoginForm(user);
    const deviceId = storedDeviceId();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(matchAccessApiMock.login).toHaveBeenCalledWith({
        deviceId,
        matchId: 'A72K9P',
        securityCode: 'REFEREE-CODE',
      });
    });
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/trong-tai');
    expect(
      window.localStorage.getItem('martial-arts-scoring.match-access.last-match-public-id'),
    ).toBe('A72K9P');
    expect(window.localStorage.getItem('martial-arts-scoring.match-access.device-id')).toBe(
      refereeSession.deviceId,
    );
  });

  it('shows inspector takeover confirmation and sends the stored challenge only after confirmation', async () => {
    const user = userEvent.setup();
    matchAccessApiMock.login.mockRejectedValue(
      new ApiClientError(409, {
        canTakeOver: true,
        code: 'SESSION_ALREADY_ACTIVE',
        takeoverToken: 'takeover-token',
      }),
    );
    matchAccessApiMock.takeover.mockResolvedValue({ session: inspectorSession });
    renderPage(MatchRole.INSPECTOR);

    await fillLoginForm(user);
    const deviceId = storedDeviceId();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Mã này đang được sử dụng trên một thiết bị hoặc trình duyệt khác.'),
    ).toBeVisible();
    expect(matchAccessApiMock.takeover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Có, tiếp tục' }));

    await waitFor(() => {
      expect(matchAccessApiMock.takeover).toHaveBeenCalledWith({
        deviceId,
        matchId: 'A72K9P',
        securityCode: 'REFEREE-CODE',
        takeoverToken: 'takeover-token',
      });
    });
    expect(await screen.findByText('Inspector console ready')).toBeVisible();
  });

  it('uses the same login and session recovery flow for the inspector console', async () => {
    const user = userEvent.setup();
    matchAccessApiMock.login.mockResolvedValue({ session: inspectorSession });
    renderPage(MatchRole.INSPECTOR);

    await fillLoginForm(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Inspector console ready')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-dinh');
  });

  it('restores a valid inspector session after a browser refresh', async () => {
    matchAccessApiMock.session.mockResolvedValue({ session: inspectorSession });
    renderPage(MatchRole.INSPECTOR);

    expect(await screen.findByText('Inspector console ready')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-dinh');
  });
});
