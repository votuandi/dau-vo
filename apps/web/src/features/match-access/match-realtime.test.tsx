import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AthleteColor,
  MatchExitMode,
  RealtimeEvent,
  RefereeSlot,
  type MatchExitResponse,
} from '@martial-arts-scoring/shared-types';
import { getParticipantsNotReadyMessage, useMatchRealtime } from './match-realtime';
import { acceptedRedVote, createMatchSnapshot, refereeSession } from '@/test/factories';

const socketHarness = vi.hoisted(() => {
  type EventHandler = (payload?: unknown) => void;
  const eventHandlers = new Map<string, Set<EventHandler>>();
  const managerEventHandlers = new Map<string, Set<EventHandler>>();
  const emit = vi.fn();
  function register(
    handlers: Map<string, Set<EventHandler>>,
    event: string,
    handler: EventHandler,
  ): void {
    const registeredHandlers = handlers.get(event) ?? new Set<EventHandler>();
    registeredHandlers.add(handler);
    handlers.set(event, registeredHandlers);
  }
  function unregister(
    handlers: Map<string, Set<EventHandler>>,
    event: string,
    handler: EventHandler,
  ): void {
    handlers.get(event)?.delete(handler);
  }
  function dispatch(
    handlers: Map<string, Set<EventHandler>>,
    event: string,
    payload?: unknown,
  ): void {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  }
  const socket = {
    active: true,
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit,
    io: {
      off: vi.fn((event: string, handler: EventHandler) => {
        unregister(managerEventHandlers, event, handler);
      }),
      on: vi.fn((event: string, handler: EventHandler) => {
        register(managerEventHandlers, event, handler);
      }),
    },
    off: vi.fn((event: string, handler: EventHandler) => {
      unregister(eventHandlers, event, handler);
    }),
    on: vi.fn((event: string, handler: EventHandler) => {
      register(eventHandlers, event, handler);
    }),
    timeout: vi.fn(() => ({ emit })),
  };
  socket.connect.mockImplementation(() => {
    socket.connected = true;
  });
  socket.disconnect.mockImplementation(() => {
    socket.connected = false;
  });
  return {
    reset: () => {
      eventHandlers.clear();
      managerEventHandlers.clear();
      socket.active = true;
      socket.connected = true;
      socket.connect.mockClear();
      socket.disconnect.mockClear();
      socket.emit.mockClear();
      socket.io.off.mockClear();
      socket.io.on.mockClear();
      socket.off.mockClear();
      socket.on.mockClear();
      socket.timeout.mockClear();
    },
    socket,
    triggerManagerEvent: (event: string, payload?: unknown) => {
      dispatch(managerEventHandlers, event, payload);
    },
    triggerSocketEvent: (event: string, payload?: unknown) => {
      dispatch(eventHandlers, event, payload);
    },
  };
});

vi.mock('@/services/socket/client', () => ({
  connectSocket: vi.fn(() => socketHarness.socket),
  disconnectSocket: vi.fn(() => {
    socketHarness.socket.disconnect();
  }),
  getSocketClient: vi.fn(() => socketHarness.socket),
  reconnectSocket: vi.fn(() => {
    socketHarness.socket.disconnect();
    socketHarness.socket.connect();
    return socketHarness.socket;
  }),
}));

describe('useMatchRealtime', () => {
  beforeEach(() => {
    socketHarness.reset();
  });
  it('formats dynamic start readiness and supports older errors without details', () => {
    expect(
      getParticipantsNotReadyMessage({
        assignedRefereeCount: 5,
        connectedRefereeCount: 3,
        inspectorConnected: true,
        requiredRefereeCount: 5,
        scoreboardConnectedCount: 1,
      }),
    ).toBe(
      'Chưa thể bắt đầu hiệp đấu. Đã phân công 5/5 trọng tài, kết nối 3/5 trọng tài và 1 bảng điểm.',
    );
    expect(getParticipantsNotReadyMessage(undefined)).toBe(
      'Chưa thể bắt đầu hiệp đấu. Chưa đáp ứng đủ trọng tài hoặc bảng điểm cần thiết.',
    );
  });
  function renderRealtime(onSessionRevoked = vi.fn()) {
    return renderHook(() =>
      useMatchRealtime({
        matchPublicId: refereeSession.matchPublicId,
        onAuthenticationRequired: vi.fn(),
        onSessionRevoked,
        refereeIdentity: { kind: 'legacy', refereeSlot: RefereeSlot.REFEREE_1 },
      }),
    );
  }
  it('hydrates an accepted referee vote from the direct recovery snapshot and prevents a duplicate submit', async () => {
    const { result } = renderRealtime();
    const snapshot = createMatchSnapshot({ viewer: { acceptedVote: acceptedRedVote } });
    act(() => {
      socketHarness.triggerSocketEvent(RealtimeEvent.MATCH_STATE, snapshot);
    });
    await waitFor(() => {
      expect(result.current.lastAcceptedVote).toEqual(acceptedRedVote);
    });
    await act(async () => {
      await result.current.submitVote(AthleteColor.BLUE);
    });
    expect(socketHarness.socket.emit).not.toHaveBeenCalledWith(
      RealtimeEvent.VOTE_SUBMIT,
      { athlete: AthleteColor.BLUE },
      expect.any(Function),
    );
  });
  it('clears the local vote lock when the server resolves the scoring window', async () => {
    const { result } = renderRealtime();
    act(() => {
      socketHarness.triggerSocketEvent(RealtimeEvent.VOTE_ACCEPTED, acceptedRedVote);
    });
    await waitFor(() => {
      expect(result.current.lastAcceptedVote).toEqual(acceptedRedVote);
    });
    act(() => {
      socketHarness.triggerSocketEvent(RealtimeEvent.SCORING_WINDOW_RESOLVED, {
        matchPublicId: refereeSession.matchPublicId,
        votes: [],
        window: {
          endsAt: '2026-09-01T12:00:01.000Z',
          id: acceptedRedVote.scoringWindowId,
          resolvedAt: '2026-09-01T12:00:01.000Z',
          roundNumber: 1,
          scoreAwarded: false,
          startedAt: '2026-09-01T12:00:00.000Z',
          winningColor: null,
        },
      });
    });
    await waitFor(() => {
      expect(result.current.lastAcceptedVote).toBeNull();
    });
  });
  it('accepts only the assigned official referee acknowledgement', async () => {
    const { result } = renderHook(() =>
      useMatchRealtime({
        matchPublicId: refereeSession.matchPublicId,
        onAuthenticationRequired: vi.fn(),
        onSessionRevoked: vi.fn(),
        refereeIdentity: { assignmentId: 'assignment-4', kind: 'official', refereePosition: 4 },
      }),
    );
    const accepted = {
      ...acceptedRedVote,
      identity: { assignmentId: 'assignment-4', kind: 'official' as const, refereePosition: 4 },
    };
    act(() => {
      socketHarness.triggerSocketEvent(RealtimeEvent.VOTE_ACCEPTED, {
        ...accepted,
        identity: { ...accepted.identity, assignmentId: 'another-assignment' },
      });
    });
    expect(result.current.lastAcceptedVote).toBeNull();
    act(() => {
      socketHarness.triggerSocketEvent(RealtimeEvent.VOTE_ACCEPTED, accepted);
    });
    await waitFor(() => {
      expect(result.current.lastAcceptedVote).toEqual(accepted);
    });
  });
  it('updates the connection state across disconnect and reconnect events', async () => {
    const { result } = renderRealtime();
    act(() => {
      socketHarness.triggerSocketEvent('disconnect');
    });
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('reconnecting');
    });
    act(() => {
      socketHarness.triggerManagerEvent('reconnect_attempt');
      socketHarness.triggerSocketEvent('connect');
    });
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });
    expect(socketHarness.socket.emit).toHaveBeenCalledWith(RealtimeEvent.MATCH_STATE_REQUEST);
  });
  it('disconnects and calls the revocation callback immediately when the server revokes the session', async () => {
    const onSessionRevoked = vi.fn();
    const { result } = renderRealtime(onSessionRevoked);
    const revocation = { code: 'SESSION_REVOKED' as const, message: 'Session was taken over' };
    act(() => {
      socketHarness.triggerSocketEvent(RealtimeEvent.SESSION_REVOKED, revocation);
    });
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('revoked');
    });
    expect(socketHarness.socket.disconnect).toHaveBeenCalledOnce();
    expect(onSessionRevoked).toHaveBeenCalledExactlyOnceWith(revocation);
    expect(result.current.snapshot).toBeNull();
    expect(result.current.presence).toEqual([]);
  });
  it('releases the requesting official from a successful exit acknowledgement without requesting match state', async () => {
    const onMatchExitAcknowledged = vi.fn();
    socketHarness.socket.emit.mockImplementation(
      (
        event: string,
        _payload?: unknown,
        acknowledge?: (error: Error | null, response: MatchExitResponse) => void,
      ) => {
        if (event === RealtimeEvent.MATCH_EXIT && acknowledge)
          acknowledge(null, {
            exit: {
              matchPublicId: refereeSession.matchPublicId,
              mode: MatchExitMode.CANCEL_RESULTS,
            },
            ok: true,
          });
      },
    );
    const { result } = renderHook(() =>
      useMatchRealtime({
        matchPublicId: refereeSession.matchPublicId,
        onAuthenticationRequired: vi.fn(),
        onMatchExitAcknowledged,
        onSessionRevoked: vi.fn(),
        refereeIdentity: null,
      }),
    );
    socketHarness.socket.emit.mockClear();
    await act(async () => {
      await expect(result.current.exitMatch(MatchExitMode.CANCEL_RESULTS)).resolves.toBe(true);
    });
    expect(onMatchExitAcknowledged).toHaveBeenCalledOnce();
    expect(socketHarness.socket.emit).toHaveBeenCalledWith(
      RealtimeEvent.MATCH_EXIT,
      { mode: MatchExitMode.CANCEL_RESULTS },
      expect.any(Function),
    );
    expect(socketHarness.socket.emit).not.toHaveBeenCalledWith(RealtimeEvent.MATCH_STATE_REQUEST);
  });
});
