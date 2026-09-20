import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentOfficialRole } from '@martial-arts-scoring/shared-types';
import { MatchAccessPage } from './match-access-page';
import { ApiClientError } from '@/services/api/client';
import type { OfficialSession } from '@/services/api/official-access';

const officialAccessApiMock = vi.hoisted(() => ({
  matches: vi.fn(),
  state: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
  takeover: vi.fn(),
}));

const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload?: unknown) => void>>();
  const socket = {
    connected: false,
    connect: vi.fn(() => {
      socket.connected = true;
      handlers.get('connect')?.forEach((handler) => {
        handler();
      });
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    emit: vi.fn(),
    off: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      const values = handlers.get(event) ?? new Set();
      values.add(handler);
      handlers.set(event, values);
    }),
  };
  return {
    socket,
    reset: () => {
      handlers.clear();
      socket.connected = false;
      socket.connect.mockClear();
      socket.disconnect.mockClear();
      socket.emit.mockClear();
      socket.on.mockClear();
      socket.off.mockClear();
    },
    trigger: (event: string, payload?: unknown) =>
      handlers.get(event)?.forEach((handler) => {
        handler(payload);
      }),
  };
});

vi.mock('@/services/api/official-access', () => ({
  officialAccessApi: officialAccessApiMock,
}));

vi.mock('@/services/socket/client', () => ({
  getSocketClient: vi.fn(() => socketHarness.socket),
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

const refereeSession: OfficialSession = {
  activeAssignment: null,
  deviceId: 'f3b90c56-b6a9-43c7-9eb0-7cbcd251acb7',
  expiresAt: '2030-01-01T00:00:00.000Z',
  official: { id: 'official-referee', name: 'Nguyễn Văn A', role: TournamentOfficialRole.REFEREE },
  sessionId: 'official-session-referee',
  status: 'READY',
  tournament: { id: 'tournament-1', name: 'Giải thử nghiệm', publicCode: 'GIAI72' },
};

const inspectorSession: OfficialSession = {
  ...refereeSession,
  deviceId: 'b2afd440-9705-48cc-a95f-4c17efaf0a2c',
  official: {
    id: 'official-inspector',
    name: 'Trần Văn B',
    role: TournamentOfficialRole.INSPECTOR,
  },
  sessionId: 'official-session-inspector',
};

function renderPage(expectedRole = TournamentOfficialRole.REFEREE) {
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
        initialEntries={[
          expectedRole === TournamentOfficialRole.REFEREE ? '/trong-tai' : '/giam-dinh',
        ]}
      >
        <MatchAccessPage expectedRole={expectedRole} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillLoginForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(await screen.findByLabelText('Mã giải đấu'), 'giai72');
  await user.type(await screen.findByLabelText('Mã bảo mật riêng'), 'REFEREE-PASSCODE');
}

function storedDeviceId(): string {
  const deviceId = window.localStorage.getItem('martial-arts-scoring.match-access.device-id');
  if (deviceId === null) {
    throw new Error('The login page did not create a browser device identifier.');
  }

  return deviceId;
}

describe('MatchAccessPage official login', () => {
  beforeEach(() => {
    officialAccessApiMock.login.mockReset();
    officialAccessApiMock.logout.mockReset();
    officialAccessApiMock.matches.mockReset();
    officialAccessApiMock.session.mockReset();
    officialAccessApiMock.state.mockReset();
    officialAccessApiMock.takeover.mockReset();
    socketHarness.reset();
    officialAccessApiMock.matches.mockResolvedValue({ matches: [] });
    officialAccessApiMock.session.mockRejectedValue(new ApiClientError(401, {}));
    window.localStorage.clear();
  });

  it('logs in with tournament code and private passcode, then shows the referee waiting state', async () => {
    const user = userEvent.setup();
    officialAccessApiMock.login.mockResolvedValue({ session: refereeSession });
    renderPage();

    await fillLoginForm(user);
    const deviceId = storedDeviceId();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(officialAccessApiMock.login).toHaveBeenCalledWith({
        deviceId,
        expectedRole: TournamentOfficialRole.REFEREE,
        privatePasscode: 'REFEREE-PASSCODE',
        tournamentCode: 'GIAI72',
      });
    });
    expect(await screen.findByText('Đang chờ phân công')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/trong-tai');
    expect(
      window.localStorage.getItem('martial-arts-scoring.match-access.last-match-public-id'),
    ).toBeNull();
  });

  it('shows inspector takeover confirmation and sends the stored challenge only after confirmation', async () => {
    const user = userEvent.setup();
    officialAccessApiMock.login.mockRejectedValue(
      new ApiClientError(409, {
        canTakeOver: true,
        code: 'SESSION_ALREADY_ACTIVE',
        takeoverToken: 'takeover-token',
      }),
    );
    officialAccessApiMock.takeover.mockResolvedValue({ session: inspectorSession });
    renderPage(TournamentOfficialRole.INSPECTOR);

    await fillLoginForm(user);
    const deviceId = storedDeviceId();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Mã này đang được sử dụng trên thiết bị khác.')).toBeVisible();
    expect(officialAccessApiMock.takeover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Có, tiếp tục' }));

    await waitFor(() => {
      expect(officialAccessApiMock.takeover).toHaveBeenCalledWith({
        deviceId,
        expectedRole: TournamentOfficialRole.INSPECTOR,
        privatePasscode: 'REFEREE-PASSCODE',
        takeoverToken: 'takeover-token',
        tournamentCode: 'GIAI72',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Khu vực giám định' })).toBeVisible();
  });

  it('uses the same login and session recovery flow for the inspector console', async () => {
    const user = userEvent.setup();
    officialAccessApiMock.login.mockResolvedValue({ session: inspectorSession });
    renderPage(TournamentOfficialRole.INSPECTOR);

    await fillLoginForm(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Khu vực giám định' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-dinh');
  });

  it('restores a valid inspector session after a browser refresh', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: inspectorSession });
    renderPage(TournamentOfficialRole.INSPECTOR);

    expect(await screen.findByRole('heading', { name: 'Khu vực giám định' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-dinh');
  });

  it('opens the referee console immediately when its correlated assignment update arrives', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');

    socketHarness.trigger('official:assignment-updated', {
      assignment: {
        id: 'assignment-1',
        match: { id: 'match-1', publicId: 'M-001', status: 'WAITING' },
        refereePosition: 1,
        role: 'REFEREE',
      },
      officialId: refereeSession.official.id,
      tournamentId: refereeSession.tournament.id,
    });

    expect(await screen.findByText('Referee console ready')).toBeVisible();
    expect(socketHarness.socket.disconnect).not.toHaveBeenCalled();
  });

  it('restores the referee console from a correlated assignment snapshot', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');

    socketHarness.trigger('official:assignment-snapshot', {
      assignment: {
        id: 'assignment-1',
        match: { id: 'match-1', publicId: 'M-001', status: 'WAITING' },
        refereePosition: 1,
        role: 'REFEREE',
      },
      official: refereeSession.official,
      sessionId: refereeSession.sessionId,
      status: 'IN_MATCH',
      tournament: refereeSession.tournament,
    });

    expect(await screen.findByText('Referee console ready')).toBeVisible();
  });

  it('does not let a late snapshot overwrite a newer assignment event', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');
    socketHarness.trigger('official:assignment-updated', {
      assignment: {
        id: 'assignment-2',
        match: { id: 'match-2', publicId: 'M-002', status: 'WAITING' },
        refereePosition: 1,
        role: 'REFEREE',
      },
      officialId: refereeSession.official.id,
      tournamentId: refereeSession.tournament.id,
    });
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    socketHarness.trigger('official:assignment-snapshot', {
      assignment: null,
      official: refereeSession.official,
      sessionId: refereeSession.sessionId,
      status: 'READY',
      tournament: refereeSession.tournament,
    });
    expect(screen.getByText('Referee console ready')).toBeVisible();
  });

  it('rejects assignment events for another official and clears the console on release', async () => {
    officialAccessApiMock.session.mockResolvedValue({
      session: {
        ...refereeSession,
        activeAssignment: {
          id: 'assignment-1',
          match: { id: 'match-1', publicId: 'M-001', status: 'WAITING' },
          refereePosition: 1,
          role: TournamentOfficialRole.REFEREE,
        },
        status: 'IN_MATCH',
      },
    });
    renderPage();
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    socketHarness.trigger('official:assignment-updated', {
      officialId: 'other',
      tournamentId: refereeSession.tournament.id,
      assignment: null,
    });
    expect(screen.getByText('Referee console ready')).toBeVisible();
    socketHarness.trigger('match:assignment-released', {
      matchId: 'match-1',
      matchPublicId: 'M-001',
      tournamentId: refereeSession.tournament.id,
      releasedOfficialIds: [refereeSession.official.id],
    });
    expect(await screen.findByText('Đang chờ phân công')).toBeVisible();
  });

  it('returns to login after session revocation', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');
    socketHarness.trigger('session:revoked', { code: 'SESSION_REVOKED', message: 'revoked' });
    expect(await screen.findByRole('heading', { name: 'Phiên đã bị thu hồi' })).toBeVisible();
  });
});
