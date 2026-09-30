import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchStatus, TournamentOfficialRole } from '@martial-arts-scoring/shared-types';
import { MatchAccessPage } from './match-access-page';
import { routes } from '@/app/router/router';
import { ApiClientError } from '@/services/api/client';
import type { OfficialSession } from '@/services/api/official-access';

const officialAccessApiMock = vi.hoisted(() => ({
  matches: vi.fn(),
  state: vi.fn(),
  take: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  session: vi.fn(),
  takeover: vi.fn(),
}));

const matchRealtimeMock = vi.hoisted(() => vi.fn<(options: unknown) => object>(() => ({})));

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
  disconnectSocket: vi.fn(() => {
    socketHarness.socket.disconnect();
  }),
  getSocketClient: vi.fn(() => socketHarness.socket),
}));

vi.mock('@/features/match-access/match-realtime', () => ({
  useMatchRealtime: matchRealtimeMock,
}));

vi.mock('@/features/match-access/judge-console', () => ({
  JudgeConsole: () => <div>Referee console ready</div>,
}));

vi.mock('@/features/match-access/supervisor-console', () => ({
  SupervisorConsole: () => <div>Inspector console ready</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

const refereeSession: OfficialSession = {
  activeAssignment: null,
  deviceId: 'f3b90c56-b6a9-43c7-9eb0-7cbcd251acb7',
  expiresAt: '2030-01-01T00:00:00.000Z',
  official: { id: 'official-referee', name: 'Nguyễn Văn A', role: TournamentOfficialRole.JUDGE },
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
    role: TournamentOfficialRole.SUPERVISOR,
  },
  sessionId: 'official-session-inspector',
};

const secondRefereeSession: OfficialSession = {
  ...refereeSession,
  official: { id: 'official-referee-b', name: 'Lê Văn B', role: TournamentOfficialRole.JUDGE },
  sessionId: 'official-session-referee-b',
};

function renderPage(expectedRole = TournamentOfficialRole.JUDGE) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            expectedRole === TournamentOfficialRole.JUDGE ? '/giam-dinh' : '/giam-sat',
          ]}
        >
          <MatchAccessPage expectedRole={expectedRole} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function renderRoute(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });

  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

async function fillLoginForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(await screen.findByLabelText('Mã giải đấu'), 'giai72');
  await user.type(await screen.findByLabelText('Mã bảo mật riêng'), 'JUDGE-PASSCODE');
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
    vi.useRealTimers();
    officialAccessApiMock.login.mockReset();
    officialAccessApiMock.logout.mockReset();
    officialAccessApiMock.matches.mockReset();
    officialAccessApiMock.session.mockReset();
    officialAccessApiMock.state.mockReset();
    officialAccessApiMock.take.mockReset();
    officialAccessApiMock.takeover.mockReset();
    matchRealtimeMock.mockClear();
    socketHarness.reset();
    officialAccessApiMock.matches.mockResolvedValue({ matches: [] });
    officialAccessApiMock.session.mockRejectedValue(new ApiClientError(401, {}));
    window.localStorage.clear();
  });

  it('logs in with tournament code and private passcode, then shows the referee waiting state', async () => {
    const user = userEvent.setup();
    officialAccessApiMock.login.mockResolvedValue({ session: refereeSession });
    renderPage();
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });

    await fillLoginForm(user);
    const deviceId = storedDeviceId();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(officialAccessApiMock.login).toHaveBeenCalledWith({
        deviceId,
        expectedRole: TournamentOfficialRole.JUDGE,
        privatePasscode: 'JUDGE-PASSCODE',
        tournamentCode: 'GIAI72',
      });
    });
    expect(await screen.findByText('Đang chờ phân công')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-dinh');
    expect(
      window.localStorage.getItem('martial-arts-scoring.match-access.last-match-public-id'),
    ).toBeNull();
  });

  it.each([
    ['/giam-dinh', TournamentOfficialRole.JUDGE],
    ['/giam-sat', TournamentOfficialRole.SUPERVISOR],
  ] as const)('uses the configured %s route role for login', async (path, expectedRole) => {
    const user = userEvent.setup();
    officialAccessApiMock.login.mockResolvedValue({
      session: expectedRole === TournamentOfficialRole.JUDGE ? refereeSession : inspectorSession,
    });
    const { router } = renderRoute(path);

    await fillLoginForm(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(officialAccessApiMock.login).toHaveBeenCalledWith(
        expect.objectContaining({ expectedRole }),
      );
    });
    expect(router.state.location.pathname).toBe(path);
  });

  it('redirects the legacy judge route once while preserving search and hash', async () => {
    const { router } = renderRoute('/trong-tai?x=1#top');

    await waitFor(() => {
      expect(router.state.location).toMatchObject({
        hash: '#top',
        pathname: '/giam-dinh',
        search: '?x=1',
      });
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('keeps the judge route canonical when a supervisor session is restored', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: inspectorSession });
    const supervisorRoute = renderRoute('/giam-dinh');

    expect(await screen.findByRole('heading', { name: 'Phiên không đúng vai trò' })).toBeVisible();
    expect(screen.getByText('Khu vực giám định')).toBeVisible();
    expect(supervisorRoute.router.state.location.pathname).toBe('/giam-dinh');

    supervisorRoute.unmount();
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    const judgeRoute = renderRoute('/giam-dinh');

    expect(await screen.findByText('Đang chờ phân công')).toBeVisible();
    expect(judgeRoute.router.state.location.pathname).toBe('/giam-dinh');
  });

  it.each([
    {
      activeRoute: '/giam-sat',
      activeRole: 'giám sát',
      console: 'Inspector console ready',
      session: inspectorSession,
      wrongRoute: '/giam-dinh',
    },
    {
      activeRoute: '/giam-dinh',
      activeRole: 'giám định',
      console: 'Referee console ready',
      session: refereeSession,
      wrongRoute: '/giam-sat',
    },
  ] as const)(
    'returns an assigned $activeRole from the wrong-role route after logout is forbidden',
    async ({ activeRoute, activeRole, console, session: activeSession, wrongRoute }) => {
      const user = userEvent.setup();
      const assignedSession: OfficialSession = {
        ...activeSession,
        activeAssignment: {
          id: `assignment-${activeSession.official.role.toLowerCase()}`,
          match: { id: 'match-active', publicId: 'M-ACTIVE', status: MatchStatus.WAITING },
          judgePosition:
            activeSession.official.role === TournamentOfficialRole.JUDGE ? 1 : null,
          role: activeSession.official.role,
        },
        status: 'IN_MATCH',
      };
      officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });
      officialAccessApiMock.logout.mockRejectedValue(
        new ApiClientError(409, { code: 'OFFICIAL_IN_MATCH_LOGOUT_FORBIDDEN' }),
      );
      const { queryClient, router } = renderRoute(wrongRoute);

      expect(await screen.findByRole('heading', { name: 'Phiên không đúng vai trò' })).toBeVisible();
      expect(router.state.location.pathname).toBe(wrongRoute);

      await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));

      expect(
        await screen.findByText(
          'Bạn đã được phân công vào trận trước khi yêu cầu đăng xuất được xử lý. Phiên vẫn được giữ.',
        ),
      ).toHaveAttribute('role', 'alert');
      expect(screen.getByRole('button', { name: `Về khu vực ${activeRole}` })).toBeEnabled();

      await user.click(screen.getByRole('button', { name: `Về khu vực ${activeRole}` }));

      expect(await screen.findByText(console)).toBeVisible();
      expect(router.state.location.pathname).toBe(activeRoute);
      expect(screen.queryByRole('heading', { name: 'Phiên không đúng vai trò' })).not.toBeInTheDocument();
      expect(queryClient.getQueryData(['official-access', 'session'])).toMatchObject({
        session: {
          activeAssignment: { id: assignedSession.activeAssignment?.id },
          sessionId: assignedSession.sessionId,
        },
      });
    },
  );

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
    renderPage(TournamentOfficialRole.SUPERVISOR);
    officialAccessApiMock.session.mockResolvedValue({ session: inspectorSession });

    await fillLoginForm(user);
    const deviceId = storedDeviceId();
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Mã này đang được sử dụng trên thiết bị khác.')).toBeVisible();
    expect(officialAccessApiMock.takeover).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Có, tiếp tục' }));

    await waitFor(() => {
      expect(officialAccessApiMock.takeover).toHaveBeenCalledWith({
        deviceId,
        expectedRole: TournamentOfficialRole.SUPERVISOR,
        privatePasscode: 'JUDGE-PASSCODE',
        takeoverToken: 'takeover-token',
        tournamentCode: 'GIAI72',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Khu vực giám sát' })).toBeVisible();
  });

  it('uses the same login and session recovery flow for the inspector console', async () => {
    const user = userEvent.setup();
    officialAccessApiMock.login.mockResolvedValue({ session: inspectorSession });
    renderPage(TournamentOfficialRole.SUPERVISOR);
    officialAccessApiMock.session.mockResolvedValue({ session: inspectorSession });

    await fillLoginForm(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Khu vực giám sát' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-sat');
  });

  it('restores a valid inspector session after a browser refresh', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: inspectorSession });
    renderPage(TournamentOfficialRole.SUPERVISOR);

    expect(await screen.findByRole('heading', { name: 'Khu vực giám sát' })).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/giam-sat');
  });

  it('opens the referee console immediately when its correlated assignment update arrives', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');

    socketHarness.trigger('official:assignment-updated', {
      assignment: {
        id: 'assignment-1',
        match: { id: 'match-1', publicId: 'M-001', status: 'WAITING' },
        judgePosition: 1,
        role: 'JUDGE',
      },
      officialId: refereeSession.official.id,
      tournamentId: refereeSession.tournament.id,
    });

    expect(await screen.findByText('Referee console ready')).toBeVisible();
    expect(socketHarness.socket.disconnect).not.toHaveBeenCalled();
    expect(socketHarness.socket.emit).toHaveBeenCalledWith('match:state:request');
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument();
  });

  it('keeps the session and reconciles an assignment when logout loses a race with assignment', async () => {
    const user = userEvent.setup();
    const assignedSession: OfficialSession = {
      ...refereeSession,
      activeAssignment: {
        id: 'assignment-race',
        match: { id: 'match-race', publicId: 'M-RACE', status: MatchStatus.WAITING },
        judgePosition: 1,
        role: TournamentOfficialRole.JUDGE,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    officialAccessApiMock.logout.mockRejectedValue(
      new ApiClientError(409, { code: 'OFFICIAL_IN_MATCH_LOGOUT_FORBIDDEN' }),
    );
    renderPage();
    await screen.findByText('Đang chờ phân công');
    officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });

    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByText('Referee console ready')).toBeVisible();
    expect(
      screen.getByText(
        'Bạn đã được phân công vào trận trước khi yêu cầu đăng xuất được xử lý. Phiên vẫn được giữ.',
      ),
    ).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument();
  });

  it('restores the referee console from a correlated assignment snapshot', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');

    socketHarness.trigger('official:assignment-snapshot', {
      assignment: {
        id: 'assignment-1',
        match: { id: 'match-1', publicId: 'M-001', status: 'WAITING' },
        judgePosition: 1,
        role: 'JUDGE',
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
        judgePosition: 1,
        role: 'JUDGE',
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
          judgePosition: 1,
          role: TournamentOfficialRole.JUDGE,
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
    expect(socketHarness.socket.disconnect).not.toHaveBeenCalled();
  });

  it('reconciles a missed release from a non-null assignment when the window regains focus', async () => {
    const assignedSession: OfficialSession = {
      ...refereeSession,
      activeAssignment: {
        id: 'assignment-missed-focus-release',
        match: {
          id: 'match-missed-focus',
          publicId: 'M-MISSED-FOCUS',
          status: MatchStatus.WAITING,
        },
        judgePosition: 1,
        role: TournamentOfficialRole.JUDGE,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });
    renderPage();
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(2);
    });

    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('Đang chờ phân công')).toBeVisible();
    expect(socketHarness.socket.disconnect).not.toHaveBeenCalled();
  });

  it('reconciles a missed release from a non-null assignment on the recovery interval', async () => {
    vi.useFakeTimers();
    const assignedSession: OfficialSession = {
      ...refereeSession,
      activeAssignment: {
        id: 'assignment-missed-interval-release',
        match: {
          id: 'match-missed-interval',
          publicId: 'M-MISSED-INTERVAL',
          status: MatchStatus.WAITING,
        },
        judgePosition: 1,
        role: TournamentOfficialRole.JUDGE,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Referee console ready')).toBeVisible();
    expect(officialAccessApiMock.session).toHaveBeenCalledTimes(2);

    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });

    expect(screen.getByText('Đang chờ phân công')).toBeVisible();
    expect(socketHarness.socket.disconnect).not.toHaveBeenCalled();
  });

  it('does not let a late HTTP reconciliation overwrite a newer assignment socket event', async () => {
    const assignedSession: OfficialSession = {
      ...refereeSession,
      activeAssignment: {
        id: 'assignment-http-old',
        match: { id: 'match-http-old', publicId: 'M-HTTP-OLD', status: MatchStatus.WAITING },
        judgePosition: 1,
        role: TournamentOfficialRole.JUDGE,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });
    renderPage();
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(2);
    });

    let resolveReconciliation: ((value: { session: OfficialSession }) => void) | undefined;
    officialAccessApiMock.session.mockImplementationOnce(
      () =>
        new Promise<{ session: OfficialSession }>((resolve) => {
          resolveReconciliation = resolve;
        }),
    );
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(3);
    });
    socketHarness.trigger('official:assignment-updated', {
      assignment: {
        id: 'assignment-socket-new',
        match: { id: 'match-socket-new', publicId: 'M-SOCKET-NEW', status: 'WAITING' },
        judgePosition: 1,
        role: 'JUDGE',
      },
      officialId: refereeSession.official.id,
      tournamentId: refereeSession.tournament.id,
    });
    resolveReconciliation?.({ session: refereeSession });

    await waitFor(() => {
      expect(socketHarness.socket.emit).toHaveBeenCalledWith('match:state:request');
    });
    expect(screen.getByText('Referee console ready')).toBeVisible();
  });

  it('keeps a non-null assignment after a transient reconciliation failure', async () => {
    const assignedSession: OfficialSession = {
      ...refereeSession,
      activeAssignment: {
        id: 'assignment-transient-error',
        match: {
          id: 'match-transient-error',
          publicId: 'M-TRANSIENT',
          status: MatchStatus.WAITING,
        },
        judgePosition: 1,
        role: TournamentOfficialRole.JUDGE,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });
    renderPage();
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(2);
    });

    officialAccessApiMock.session.mockRejectedValueOnce(new Error('network unavailable'));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(3);
    });

    expect(screen.getByText('Referee console ready')).toBeVisible();
  });

  it('leaves an assigned console when reconciliation finds a revoked session', async () => {
    const assignedSession: OfficialSession = {
      ...refereeSession,
      activeAssignment: {
        id: 'assignment-revoked-session',
        match: { id: 'match-revoked-session', publicId: 'M-REVOKED', status: MatchStatus.WAITING },
        judgePosition: 1,
        role: TournamentOfficialRole.JUDGE,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: assignedSession });
    const { queryClient } = renderPage();
    expect(await screen.findByText('Referee console ready')).toBeVisible();
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(2);
    });

    officialAccessApiMock.session.mockRejectedValueOnce(new ApiClientError(401, {}));
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByRole('heading', { name: 'Phiên đã bị thu hồi' })).toBeVisible();
    expect(screen.queryByText('Referee console ready')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['official-access', 'session'])).toBeNull();
    expect(socketHarness.socket.disconnect).toHaveBeenCalledOnce();
    expect(socketHarness.socket.connect).toHaveBeenCalledOnce();
  });

  it('ignores a delayed 401 reconciliation from a retired official session', async () => {
    const user = userEvent.setup();
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    officialAccessApiMock.login.mockResolvedValue({ session: secondRefereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(2);
    });

    let rejectReconciliation: ((reason?: unknown) => void) | undefined;
    officialAccessApiMock.session.mockImplementationOnce(
      () =>
        new Promise<{ session: OfficialSession }>((_, reject) => {
          rejectReconciliation = reject;
        }),
    );
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => {
      expect(officialAccessApiMock.session).toHaveBeenCalledTimes(3);
    });

    socketHarness.trigger('session:revoked', { code: 'SESSION_REVOKED', message: 'revoked' });
    expect(await screen.findByRole('heading', { name: 'Phiên đã bị thu hồi' })).toBeVisible();
    officialAccessApiMock.session.mockResolvedValue({ session: secondRefereeSession });

    await fillLoginForm(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Lê Văn B')).toBeVisible();

    rejectReconciliation?.(new ApiClientError(401, {}));
    await waitFor(() => {
      expect(screen.getByText('Lê Văn B')).toBeVisible();
    });

    expect(screen.getByText('Lê Văn B')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Phiên đã bị thu hồi' })).not.toBeInTheDocument();
    expect(socketHarness.socket.disconnect).toHaveBeenCalledOnce();
    expect(socketHarness.socket.connect).toHaveBeenCalledTimes(2);
  });

  it('returns an exiting inspector to the match list from the authoritative exit acknowledgement', async () => {
    const assignedInspectorSession: OfficialSession = {
      ...inspectorSession,
      activeAssignment: {
        id: 'assignment-inspector-exit',
        match: { id: 'match-exit', publicId: 'M-EXIT', status: MatchStatus.BREAK },
        judgePosition: null,
        role: TournamentOfficialRole.SUPERVISOR,
      },
      status: 'IN_MATCH',
    };
    officialAccessApiMock.session.mockResolvedValue({ session: assignedInspectorSession });
    officialAccessApiMock.matches.mockResolvedValue({ matches: [] });
    const { queryClient } = renderPage(TournamentOfficialRole.SUPERVISOR);

    expect(await screen.findByText('Inspector console ready')).toBeVisible();
    const options = matchRealtimeMock.mock.calls.at(-1)?.[0];
    if (
      typeof options !== 'object' ||
      options === null ||
      !('onMatchExitAcknowledged' in options) ||
      typeof options.onMatchExitAcknowledged !== 'function'
    )
      throw new Error('The assigned inspector did not receive the exit acknowledgement callback.');
    (options as { onMatchExitAcknowledged: () => void }).onMatchExitAcknowledged();

    expect(await screen.findByRole('heading', { name: 'Khu vực giám sát' })).toBeVisible();
    expect(screen.queryByText('Inspector console ready')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['official-access', 'session'])).toMatchObject({
      session: { activeAssignment: null, status: 'READY' },
    });
    expect(socketHarness.socket.disconnect).not.toHaveBeenCalled();
  });

  it('returns to login after session revocation', async () => {
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    renderPage();
    await screen.findByText('Đang chờ phân công');
    socketHarness.trigger('session:revoked', { code: 'SESSION_REVOKED', message: 'revoked' });
    expect(await screen.findByRole('heading', { name: 'Phiên đã bị thu hồi' })).toBeVisible();
  });

  it("retires A's socket lifecycle before connecting B and ignores A's late snapshot", async () => {
    const user = userEvent.setup();
    officialAccessApiMock.session.mockResolvedValue({ session: refereeSession });
    officialAccessApiMock.logout.mockResolvedValue(undefined);
    officialAccessApiMock.login.mockResolvedValue({ session: secondRefereeSession });
    const { queryClient } = renderPage();
    await screen.findByText('Đang chờ phân công');

    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    expect(queryClient.getQueryData(['official-access', 'session'])).toBeNull();
    await fillLoginForm(user);
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Lê Văn B')).toBeVisible();

    expect(socketHarness.socket.disconnect).toHaveBeenCalledOnce();
    expect(socketHarness.socket.connect).toHaveBeenCalledTimes(2);

    socketHarness.trigger('official:assignment-snapshot', {
      assignment: {
        id: 'assignment-a',
        match: { id: 'match-a', publicId: 'M-A', status: 'WAITING' },
        judgePosition: 1,
        role: 'JUDGE',
      },
      official: refereeSession.official,
      sessionId: refereeSession.sessionId,
      status: 'IN_MATCH',
      tournament: refereeSession.tournament,
    });
    expect(screen.queryByText('Referee console ready')).not.toBeInTheDocument();

    socketHarness.trigger('official:assignment-updated', {
      assignment: {
        id: 'assignment-b',
        match: { id: 'match-b', publicId: 'M-B', status: 'WAITING' },
        judgePosition: 1,
        role: 'JUDGE',
      },
      officialId: secondRefereeSession.official.id,
      tournamentId: secondRefereeSession.tournament.id,
    });
    expect(await screen.findByText('Referee console ready')).toBeVisible();
  });

  it('takes a match once with the selected available referees and enters the authoritative console', async () => {
    const user = userEvent.setup();
    const match = {
      athletes: [
        { color: 'BLUE', name: 'Võ sĩ X' },
        { color: 'RED', name: 'Võ sĩ Y' },
      ],
      claimable: true,
      id: 'match-1',
      lifecycle: 'NOT_STARTED' as const,
      publicId: 'M-001',
      requiredJudgeCount: 2,
      status: 'WAITING',
    };
    officialAccessApiMock.session
      .mockResolvedValueOnce({ session: inspectorSession })
      .mockResolvedValueOnce({ session: inspectorSession })
      .mockResolvedValueOnce({
        session: {
          ...inspectorSession,
          activeAssignment: {
            id: 'assignment-inspector',
            match: { id: match.id, publicId: match.publicId, status: 'WAITING' },
            judgePosition: null,
            role: TournamentOfficialRole.SUPERVISOR,
          },
          status: 'IN_MATCH',
        },
      });
    officialAccessApiMock.matches.mockResolvedValue({ matches: [match] });
    officialAccessApiMock.state.mockResolvedValue({
      match: {
        id: match.id,
        lifecycle: match.lifecycle,
        officialAssignments: [],
        requiredJudgeCount: 2,
      },
      referees: [
        { assignedMatchId: null, id: 'referee-1', name: 'Trọng tài 1', status: 'READY' },
        { assignedMatchId: null, id: 'referee-2', name: 'Trọng tài 2', status: 'READY' },
        { assignedMatchId: null, id: 'referee-3', name: 'Trọng tài 3', status: 'IN_MATCH' },
      ],
    });
    officialAccessApiMock.take.mockResolvedValue({ match: { id: match.id } });
    renderPage(TournamentOfficialRole.SUPERVISOR);

    await user.click(await screen.findByRole('button', { name: /M-001/ }));
    expect(screen.getByRole('button', { name: 'Nhận trận' })).toBeDisabled();
    expect(screen.getByLabelText('Chọn giám định Trọng tài 3')).toBeDisabled();
    await user.click(screen.getByLabelText('Chọn giám định Trọng tài 1'));
    await user.click(screen.getByLabelText('Chọn giám định Trọng tài 2'));
    await user.click(screen.getByRole('button', { name: 'Nhận trận' }));

    await waitFor(() => {
      expect(officialAccessApiMock.take).toHaveBeenCalledTimes(1);
      expect(officialAccessApiMock.take).toHaveBeenCalledWith(match.id, ['referee-1', 'referee-2']);
    });
    expect(await screen.findByText('Inspector console ready')).toBeVisible();
  });
});
