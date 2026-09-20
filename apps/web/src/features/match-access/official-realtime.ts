import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RealtimeEvent,
  MatchStatus,
  TournamentOfficialRole,
  type MatchAssignmentReleasedPayload,
  type OfficialAssignmentSnapshot,
  type OfficialAssignmentUpdatedPayload,
} from '@martial-arts-scoring/shared-types';
import {
  officialAccessApi,
  type OfficialAssignment,
  type OfficialSession,
} from '@/services/api/official-access';
import { disconnectSocket, getSocketClient } from '@/services/socket/client';

export const officialSessionQueryKey = ['official-access', 'session'] as const;

const matchStatusByWireValue: Readonly<Record<string, MatchStatus>> = {
  WAITING: MatchStatus.WAITING,
  ROUND_1_RUNNING: MatchStatus.ROUND_1_RUNNING,
  ROUND_1_PAUSED: MatchStatus.ROUND_1_PAUSED,
  BREAK: MatchStatus.BREAK,
  ROUND_2_RUNNING: MatchStatus.ROUND_2_RUNNING,
  ROUND_2_PAUSED: MatchStatus.ROUND_2_PAUSED,
  AWAITING_RESULT_SAVE: MatchStatus.AWAITING_RESULT_SAVE,
  FINISHED: MatchStatus.FINISHED,
};

function matchStatusFromWire(status: string): MatchStatus {
  const typedStatus = matchStatusByWireValue[status];
  if (typedStatus === undefined) throw new Error(`Unsupported match status: ${status}`);
  return typedStatus;
}

function connectionIdentity(session: OfficialSession | undefined): string | null {
  if (!session) return null;
  return `${session.sessionId}:${session.official.id}:${session.tournament.id}`;
}

function assignmentFromSnapshot(
  assignment: OfficialAssignmentSnapshot['assignment'],
): OfficialAssignment | null {
  if (assignment === null) return null;
  const role =
    assignment.role === 'REFEREE'
      ? TournamentOfficialRole.REFEREE
      : TournamentOfficialRole.INSPECTOR;
  return {
    ...assignment,
    match: { ...assignment.match, status: matchStatusFromWire(assignment.match.status) },
    role,
  };
}

/**
 * Owns the singleton official routing channel.  Screens may come and go while
 * this hook is mounted, but they never own (or disconnect) the socket.
 */
export function useOfficialAssignment(session: OfficialSession | undefined, onRevoked: () => void) {
  const queryClient = useQueryClient();
  const [assignment, setAssignment] = useState<OfficialAssignment | null>(
    session?.activeAssignment ?? null,
  );
  const [connected, setConnected] = useState(false);
  const assignmentRef = useRef(assignment);
  const eventEpoch = useRef(0);
  const assignmentEventEpoch = useRef(0);
  const identityRef = useRef(connectionIdentity(session));
  const assignmentIdentityRef = useRef(connectionIdentity(session));
  const releasedAssignmentIds = useRef(new Set<string>());
  const connectedIdentityRef = useRef<string | null>(null);
  const revokedRef = useRef(onRevoked);
  revokedRef.current = onRevoked;
  assignmentRef.current = assignment;

  const sessionId = session?.sessionId;
  const officialId = session?.official.id;
  const tournamentId = session?.tournament.id;
  const sessionAssignment = session?.activeAssignment;
  const identity = connectionIdentity(session);

  const acknowledgeAssignmentRelease = useCallback(
    (releasedAssignment: Pick<OfficialAssignment, 'id' | 'match'>) => {
      const current = assignmentRef.current;
      if (
        current?.id !== releasedAssignment.id ||
        current.match.id !== releasedAssignment.match.id
      )
        return;

      // The command acknowledgement is authoritative for its requester. Keep
      // its old assignment retired if a delayed socket snapshot arrives later.
      releasedAssignmentIds.current.add(releasedAssignment.id);
      eventEpoch.current += 1;
      assignmentEventEpoch.current += 1;
      assignmentRef.current = null;
      assignmentIdentityRef.current = identity;
      queryClient.removeQueries({
        queryKey: ['official-match', releasedAssignment.match.id],
      });
      queryClient.setQueryData(
        officialSessionQueryKey,
        (currentSession: { session: OfficialSession } | null | undefined) =>
          currentSession
            ? {
                session: {
                  ...currentSession.session,
                  activeAssignment: null,
                  status: 'READY',
                },
              }
            : currentSession,
      );
      setAssignment(null);
      void queryClient.invalidateQueries({
        queryKey: ['official-matches', session?.tournament.id],
      });
    },
    [identity, queryClient, session?.tournament.id],
  );

  // State updates run after render. Do this inexpensive synchronous reset as
  // well so a newly rendered session can never briefly render the prior
  // official's assignment or reuse its ordering guards.
  if (identityRef.current !== identity) {
    identityRef.current = identity;
    assignmentRef.current = null;
    assignmentIdentityRef.current = null;
    connectedIdentityRef.current = null;
    releasedAssignmentIds.current.clear();
    eventEpoch.current = 0;
    assignmentEventEpoch.current = 0;
  }

  useEffect(() => {
    eventEpoch.current = 0;
    assignmentEventEpoch.current = 0;
  }, [identity]);

  useEffect(() => {
    assignmentIdentityRef.current = identity;
    setAssignment(sessionAssignment ?? null);
  }, [identity, sessionAssignment]);

  useEffect(() => {
    if (!identity || !sessionId || !officialId || !tournamentId) {
      setConnected(false);
      return;
    }
    const socket = getSocketClient();
    let disposed = false;
    const diagnostic = (event: string, details?: Record<string, unknown>) => {
      // Deliberately IDs/status only: never include cookies, tokens, or passcodes.
      console.info('[official-realtime]', event, details);
    };
    const apply = (next: OfficialAssignment | null, source: string) => {
      if (next !== null && releasedAssignmentIds.current.has(next.id)) {
        diagnostic('assignment-rejected', { source: 'retired', sessionId });
        return;
      }
      eventEpoch.current += 1;
      setAssignment((previous) => {
        assignmentRef.current = next;
        assignmentIdentityRef.current = identity;
        if (previous?.match.id !== next?.match.id && previous)
          queryClient.removeQueries({ queryKey: ['official-match', previous.match.id] });
        queryClient.setQueryData(
          officialSessionQueryKey,
          (current: { session: OfficialSession } | null | undefined) =>
            current
              ? {
                  session: {
                    ...current.session,
                    activeAssignment: next,
                    status: next ? 'IN_MATCH' : 'READY',
                  },
                }
              : current,
        );
        diagnostic('assignment-accepted', { source, assigned: next !== null, sessionId });
        return next;
      });
    };
    const reconcile = async (reason: string) => {
      const startedAtEpoch = eventEpoch.current;
      diagnostic('reconcile-requested', { reason, sessionId });
      try {
        const response = await officialAccessApi.session();
        if (
          disposed ||
          eventEpoch.current !== startedAtEpoch ||
          response.session.sessionId !== sessionId
        )
          return;
        apply(response.session.activeAssignment, `http:${reason}`);
      } catch {
        // The socket's revocation message remains the immediate path; the next
        // protected request will also clear an invalid cookie normally.
        diagnostic('reconcile-failed', { reason, sessionId });
      }
    };
    const onConnect = () => {
      connectedIdentityRef.current = identity;
      setConnected(true);
      diagnostic('connected', { sessionId });
      socket.emit(RealtimeEvent.OFFICIAL_ASSIGNMENT_SNAPSHOT_REQUEST);
      void reconcile('connect');
    };
    const onDisconnect = () => {
      connectedIdentityRef.current = null;
      setConnected(false);
      diagnostic('disconnected', { sessionId });
    };
    const onSnapshot = (payload: OfficialAssignmentSnapshot) => {
      if (
        payload.sessionId !== sessionId ||
        payload.official.id !== officialId ||
        payload.tournament.id !== tournamentId
      ) {
        diagnostic('assignment-rejected', { source: 'snapshot', sessionId });
        return;
      }
      // Socket.IO preserves a connection's ordering, but an async server
      // revalidation may still have built this snapshot before an assignment
      // update. HTTP reconciliation is the recovery path after an update.
      if (assignmentEventEpoch.current > 0) {
        diagnostic('assignment-rejected', { source: 'stale-snapshot', sessionId });
        return;
      }
      apply(assignmentFromSnapshot(payload.assignment), 'snapshot');
    };
    const onUpdated = (payload: OfficialAssignmentUpdatedPayload) => {
      if (payload.officialId !== officialId || payload.tournamentId !== tournamentId) {
        diagnostic('assignment-rejected', { source: 'updated', sessionId });
        return;
      }
      assignmentEventEpoch.current += 1;
      apply(assignmentFromSnapshot(payload.assignment), 'updated');
      // Revalidation joins the newly assigned match room before replying with
      // the private, recipient-specific state snapshot.
      if (payload.assignment !== null) socket.emit(RealtimeEvent.MATCH_STATE_REQUEST);
    };
    const onReleased = (payload: MatchAssignmentReleasedPayload) => {
      if (
        payload.tournamentId !== tournamentId ||
        !payload.releasedOfficialIds.includes(officialId)
      )
        return;
      if (assignmentRef.current?.match.id === payload.matchId) {
        assignmentEventEpoch.current += 1;
        apply(null, 'released');
      }
    };
    const onRevocation = () => {
      setConnected(false);
      connectedIdentityRef.current = null;
      setAssignment(null);
      assignmentIdentityRef.current = null;
      queryClient.setQueryData(officialSessionQueryKey, null);
      diagnostic('revoked', { sessionId });
      revokedRef.current();
    };
    const onFocus = () => {
      if (!document.hidden && assignmentRef.current === null) void reconcile('focus');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(RealtimeEvent.OFFICIAL_ASSIGNMENT_SNAPSHOT, onSnapshot);
    socket.on(RealtimeEvent.OFFICIAL_ASSIGNMENT_UPDATED, onUpdated);
    socket.on(RealtimeEvent.MATCH_ASSIGNMENT_RELEASED, onReleased);
    socket.on(RealtimeEvent.SESSION_REVOKED, onRevocation);
    window.addEventListener('focus', onFocus);
    const recoveryTimer = window.setInterval(() => {
      if (assignmentRef.current === null) void reconcile('interval');
    }, 12_000);
    if (socket.connected) onConnect();
    else socket.connect();
    return () => {
      disposed = true;
      window.clearInterval(recoveryTimer);
      window.removeEventListener('focus', onFocus);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(RealtimeEvent.OFFICIAL_ASSIGNMENT_SNAPSHOT, onSnapshot);
      socket.off(RealtimeEvent.OFFICIAL_ASSIGNMENT_UPDATED, onUpdated);
      socket.off(RealtimeEvent.MATCH_ASSIGNMENT_RELEASED, onReleased);
      socket.off(RealtimeEvent.SESSION_REVOKED, onRevocation);
      // This hook owns the authenticated lifecycle, not an individual screen.
      // An assignment rerender leaves `identity` unchanged, while logout,
      // takeover, or another official's login retires the old handshake.
      disconnectSocket();
    };
  }, [identity, officialId, queryClient, sessionId, tournamentId]);

  return {
    assignment: assignmentIdentityRef.current === identity ? assignment : null,
    acknowledgeAssignmentRelease,
    connected: connectedIdentityRef.current === identity && connected,
  };
}
