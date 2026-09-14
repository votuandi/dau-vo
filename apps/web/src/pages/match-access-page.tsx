import { useEffect, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  MatchRole,
  RealtimeEvent,
  TournamentOfficialRole,
  type OfficialAssignmentSnapshot,
  type OfficialAssignmentUpdatedPayload,
  type MatchAssignmentReleasedPayload,
} from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { getOrCreateDeviceId } from '@/features/match-access/device';
import {
  useMatchRealtime,
  type RealtimeRefereeIdentity,
} from '@/features/match-access/match-realtime';
import { InspectorConsole } from '@/features/match-access/inspector-console';
import { RefereeConsole } from '@/features/match-access/referee-console';
import { ApiClientError } from '@/services/api/client';
import {
  officialAccessApi,
  type OfficialAssignment,
  type OfficialMatch,
  type OfficialSession,
} from '@/services/api/official-access';
import type { MatchAccessSession } from '@/services/api/match-access';
import { getSocketClient } from '@/services/socket/client';

interface Props {
  readonly expectedRole: TournamentOfficialRole;
}
const sessionKey = ['official-access', 'session'] as const;
const pathFor = (role: TournamentOfficialRole) =>
  role === TournamentOfficialRole.REFEREE ? '/trong-tai' : '/giam-dinh';
const toConsoleSession = (s: OfficialSession, a: OfficialAssignment): MatchAccessSession => ({
  deviceId: s.deviceId,
  expiresAt: s.expiresAt,
  matchPublicId: a.match.publicId,
  role: a.role === TournamentOfficialRole.REFEREE ? MatchRole.REFEREE : MatchRole.INSPECTOR,
  sessionId: s.sessionId,
  refereeSlot: null,
});
const realtimeRefereeIdentity = (assignment: OfficialAssignment): RealtimeRefereeIdentity =>
  assignment.role === TournamentOfficialRole.REFEREE &&
  typeof assignment.refereePosition === 'number'
    ? {
        assignmentId: assignment.id,
        kind: 'official',
        refereePosition: assignment.refereePosition,
      }
    : null;
const toAssignment = (
  assignment: OfficialAssignmentSnapshot['assignment'],
): OfficialAssignment | null =>
  assignment === null
    ? null
    : {
        ...assignment,
        role:
          assignment.role === 'REFEREE'
            ? TournamentOfficialRole.REFEREE
            : TournamentOfficialRole.INSPECTOR,
      };
function errorMessage(e: unknown) {
  return e instanceof ApiClientError && e.body.code === 'INVALID_OFFICIAL_CREDENTIALS'
    ? 'Mã giải đấu hoặc mã bảo mật riêng không đúng.'
    : e instanceof ApiClientError
      ? (e.body.message ?? 'Không thể thực hiện yêu cầu.')
      : 'Không thể kết nối đến máy chủ.';
}

function Waiting({
  session,
  connected,
  logout,
  pending,
}: {
  session: OfficialSession;
  connected: boolean;
  logout: () => void;
  pending: boolean;
}) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl place-items-center p-4">
      <section aria-live="polite" className="w-full rounded-2xl border bg-card p-7 shadow-xl">
        <p className="text-sm font-bold text-primary">{session.tournament.name}</p>
        <h1 className="mt-2 text-3xl font-black">Đang chờ phân công</h1>
        <p className="mt-4">
          {session.official.name} · <strong>{session.status}</strong>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {connected
            ? 'Đã kết nối. Vui lòng chờ giám định phân công trận đấu.'
            : 'Ngoại tuyến. Đang chờ kết nối để nhận phân công.'}
        </p>
        <Button
          className="mt-6"
          disabled={pending}
          onClick={logout}
          type="button"
          variant="outline"
        >
          {pending ? 'Đang thoát…' : 'Thoát'}
        </Button>
      </section>
    </main>
  );
}

function InspectorAssignment({
  session,
  logout,
  pending,
}: {
  session: OfficialSession;
  logout: () => void;
  pending: boolean;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<OfficialMatch | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const matches = useQuery({
    queryKey: ['official-matches', session.tournament.id],
    queryFn: officialAccessApi.matches,
    staleTime: 0,
  });
  const state = useQuery({
    queryKey: ['official-match', selected?.id],
    queryFn: () => {
      if (selected === null) throw new Error('A match must be selected before loading its state.');
      return officialAccessApi.state(selected.id);
    },
    enabled: !!selected,
    staleTime: 0,
  });
  useEffect(() => {
    if (state.data)
      setPicked(
        state.data.match.officialAssignments
          .filter((x) => x.role === TournamentOfficialRole.REFEREE)
          .map((x) => x.officialId),
      );
  }, [state.data]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['official-matches', session.tournament.id] });
    if (selected) void qc.invalidateQueries({ queryKey: ['official-match', selected.id] });
  };
  const claim = useMutation({
    mutationFn: officialAccessApi.claim,
    onSuccess: refresh,
    onError: refresh,
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (selected === null)
        throw new Error('A match must be selected before confirming referees.');
      return officialAccessApi.confirm(selected.id, picked);
    },
    onSuccess: refresh,
    onError: (e) => {
      const d = e instanceof ApiClientError ? e.body.details : undefined;
      if (
        e instanceof ApiClientError &&
        e.body.code === 'REFEREE_ALREADY_IN_MATCH' &&
        d &&
        typeof d === 'object' &&
        'name' in d &&
        typeof d.name === 'string'
      )
        setConflict(`Trọng tài ${d.name} đang trong trận khác. Vui lòng chọn lại.`);
      refresh();
    },
  });
  const required = state.data?.match.requiredRefereeCount ?? 0;
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">{session.tournament.name}</p>
          <h1 className="text-3xl font-black">Khu vực giám định</h1>
        </div>
        <Button disabled={pending} onClick={logout} type="button" variant="outline">
          Thoát
        </Button>
      </header>
      <section aria-live="polite" className="mt-5 grid gap-3 md:grid-cols-2">
        {matches.data?.matches.map((m) => (
          <button
            className="rounded-xl border p-4 text-left focus-visible:ring-2"
            key={m.id}
            onClick={() => {
              setSelected(m);
              setConflict(null);
            }}
            type="button"
          >
            <strong>{m.publicId}</strong>
            <p className="mt-1 text-sm">
              {m.athletes.map((a) => a.name).join(' · ')} · Cần {m.requiredRefereeCount} trọng tài
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {m.claimable ? 'Có thể nhận trận' : 'Đã có giám định khác nhận'}
            </p>
          </button>
        ))}
      </section>
      {matches.isError ? (
        <p role="alert">
          Không tải được danh sách.{' '}
          <button onClick={() => void matches.refetch()} type="button">
            Thử lại
          </button>
        </p>
      ) : null}
      {selected ? (
        <section className="mt-6 rounded-2xl border p-5">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-black">Phân công {selected.publicId}</h2>
            <Button
              disabled={claim.isPending || !selected.claimable}
              onClick={() => {
                claim.mutate(selected.id);
              }}
              type="button"
            >
              Nhận trận
            </Button>
          </div>
          <p className="mt-2 text-sm">
            Chọn đúng {required} trọng tài. Máy chủ kiểm tra trạng thái sẵn sàng khi bắt đầu.
          </p>
          <fieldset className="mt-4 grid gap-2" disabled={confirm.isPending || state.isFetching}>
            <legend className="sr-only">Chọn trọng tài</legend>
            {state.data?.referees.map((r) => {
              const unavailable =
                !r.isActive || (!!r.assignedMatchId && r.assignedMatchId !== selected.id);
              return (
                <label className="flex items-center justify-between rounded border p-3" key={r.id}>
                  <span>
                    {r.name}{' '}
                    {!r.isActive
                      ? '· DISABLED'
                      : unavailable
                        ? '· Đang trong trận khác'
                        : '· READY'}
                  </span>
                  <input
                    checked={picked.includes(r.id)}
                    disabled={unavailable}
                    onChange={() => {
                      setPicked((old) =>
                        old.includes(r.id)
                          ? old.filter((id) => id !== r.id)
                          : old.length < required
                            ? [...old, r.id]
                            : old,
                      );
                    }}
                    type="checkbox"
                  />
                </label>
              );
            })}
          </fieldset>
          <Button
            className="mt-4"
            disabled={confirm.isPending || picked.length !== required}
            onClick={() => {
              confirm.mutate();
            }}
            type="button"
          >
            {confirm.isPending ? 'Đang xác nhận…' : 'Xác nhận phân công'}
          </Button>
        </section>
      ) : null}
      {conflict ? (
        <ConfirmationDialog
          actionLabel="Đã hiểu"
          busy={false}
          description={conflict}
          onCancel={() => {
            setConflict(null);
          }}
          onConfirm={() => {
            setConflict(null);
          }}
          title="Không thể phân công"
        />
      ) : null}
    </main>
  );
}

function AssignedConsole({
  session,
  assignment,
  logout,
  pending,
  revoked,
}: {
  session: OfficialSession;
  assignment: OfficialAssignment;
  logout: () => void;
  pending: boolean;
  revoked: () => void;
}) {
  const realtime = useMatchRealtime({
    keepSocketConnected: true,
    matchPublicId: assignment.match.publicId,
    refereeIdentity: realtimeRefereeIdentity(assignment),
    onAuthenticationRequired: revoked,
    onSessionRevoked: revoked,
  });
  const props = {
    isLogoutPending: pending,
    onLogout: logout,
    realtime,
    session: toConsoleSession(session, assignment),
  };
  return assignment.role === TournamentOfficialRole.REFEREE ? (
    <RefereeConsole {...props} />
  ) : (
    <InspectorConsole {...props} />
  );
}

export function MatchAccessPage({ expectedRole }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [deviceId] = useState(getOrCreateDeviceId);
  const [code, setCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<OfficialAssignment | null>(null);
  const [connected, setConnected] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await officialAccessApi.session();
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 0,
  });
  const identity = session.data?.session;
  useEffect(() => {
    setAssignment(identity?.activeAssignment ?? null);
    setRevoked(false);
    // The assignment is deliberately owned by the authoritative socket after initial recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.sessionId]);
  useEffect(() => {
    if (!identity) return;
    const socket = getSocketClient();
    const accept = (next: OfficialAssignment | null) => {
      setAssignment((old) => {
        if (old?.id !== next?.id || old?.match.id !== next?.match.id) {
          if (old) qc.removeQueries({ queryKey: ['official-match', old.match.id] });
        }
        qc.setQueryData(sessionKey, (current: { session: OfficialSession } | undefined) =>
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
        return next;
      });
    };
    const snapshot = (p: OfficialAssignmentSnapshot) => {
      if (
        p.sessionId === identity.sessionId &&
        p.official.id === identity.official.id &&
        p.tournament.id === identity.tournament.id
      )
        accept(toAssignment(p.assignment));
    };
    const updated = (p: OfficialAssignmentUpdatedPayload) => {
      if (p.officialId === identity.official.id && p.tournamentId === identity.tournament.id)
        accept(toAssignment(p.assignment));
    };
    const released = (p: MatchAssignmentReleasedPayload) => {
      if (
        assignment &&
        p.tournamentId === identity.tournament.id &&
        p.matchId === assignment.match.id &&
        p.releasedOfficialIds.includes(identity.official.id)
      )
        accept(null);
    };
    const revoke = () => {
      setConnected(false);
      setRevoked(true);
      setAssignment(null);
      qc.setQueryData(sessionKey, null);
    };
    const connect = () => {
      setConnected(true);
      socket.emit(RealtimeEvent.OFFICIAL_ASSIGNMENT_SNAPSHOT_REQUEST);
    };
    const disconnect = () => {
      setConnected(false);
    };
    socket.on('connect', connect);
    socket.on('disconnect', disconnect);
    socket.on(RealtimeEvent.OFFICIAL_ASSIGNMENT_SNAPSHOT, snapshot);
    socket.on(RealtimeEvent.OFFICIAL_ASSIGNMENT_UPDATED, updated);
    socket.on(RealtimeEvent.MATCH_ASSIGNMENT_RELEASED, released);
    socket.on(RealtimeEvent.SESSION_REVOKED, revoke);
    if (socket.connected) connect();
    else socket.connect();
    return () => {
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      socket.off(RealtimeEvent.OFFICIAL_ASSIGNMENT_SNAPSHOT, snapshot);
      socket.off(RealtimeEvent.OFFICIAL_ASSIGNMENT_UPDATED, updated);
      socket.off(RealtimeEvent.MATCH_ASSIGNMENT_RELEASED, released);
      socket.off(RealtimeEvent.SESSION_REVOKED, revoke);
      socket.disconnect();
    };
  }, [assignment, identity, qc]);
  const login = useMutation({
    mutationFn: () =>
      officialAccessApi.login({
        tournamentCode: code.trim().toUpperCase(),
        privatePasscode: passcode.trim(),
        deviceId,
        expectedRole,
      }),
    onSuccess: (x) => {
      qc.setQueryData(sessionKey, x);
      void nav(pathFor(x.session.official.role), { replace: true });
    },
    onError: (e) => {
      if (
        e instanceof ApiClientError &&
        e.status === 409 &&
        typeof e.body.takeoverToken === 'string'
      )
        setChallenge(e.body.takeoverToken);
      else setError(errorMessage(e));
    },
  });
  const takeover = useMutation({
    mutationFn: () =>
      officialAccessApi.takeover({
        tournamentCode: code.trim().toUpperCase(),
        privatePasscode: passcode.trim(),
        deviceId,
        expectedRole,
        takeoverToken: (() => {
          if (challenge === null) throw new Error('A takeover challenge is required.');
          return challenge;
        })(),
      }),
    onSuccess: (x) => {
      qc.setQueryData(sessionKey, x);
      setChallenge(null);
    },
    onError: (e) => {
      setChallenge(null);
      setError(errorMessage(e));
    },
  });
  const logout = useMutation({
    mutationFn: officialAccessApi.logout,
    onSuccess: () => {
      setAssignment(null);
      qc.setQueryData(sessionKey, null);
    },
  });
  if (session.isPending)
    return (
      <p className="p-8" aria-live="polite">
        Đang khôi phục phiên đăng nhập…
      </p>
    );
  if (identity && identity.official.role !== expectedRole)
    return <Navigate replace to={pathFor(identity.official.role)} />;
  if (identity && assignment)
    return (
      <AssignedConsole
        assignment={assignment}
        logout={() => {
          logout.mutate();
        }}
        pending={logout.isPending}
        revoked={() => {
          setRevoked(true);
          qc.setQueryData(sessionKey, null);
        }}
        session={identity}
      />
    );
  if (identity)
    return identity.official.role === TournamentOfficialRole.INSPECTOR ? (
      <InspectorAssignment
        logout={() => {
          logout.mutate();
        }}
        pending={logout.isPending}
        session={identity}
      />
    ) : (
      <Waiting
        connected={connected}
        logout={() => {
          logout.mutate();
        }}
        pending={logout.isPending}
        session={identity}
      />
    );
  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !passcode.trim()) {
      setError('Vui lòng nhập mã giải đấu và mã bảo mật riêng.');
      return;
    }
    login.mutate();
  };
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center p-4">
      <form className="w-full rounded-2xl border bg-card p-7 shadow-xl" onSubmit={submit}>
        <p className="text-sm font-bold text-primary">
          {expectedRole === TournamentOfficialRole.REFEREE
            ? 'Khu vực trọng tài'
            : 'Khu vực giám định'}
        </p>
        <h1 className="mt-2 text-3xl font-black">
          {revoked ? 'Phiên đã bị thu hồi' : 'Đăng nhập'}
        </h1>
        {revoked ? (
          <p className="mt-4" role="alert">
            Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.
          </p>
        ) : null}
        <label className="mt-6 block font-semibold">
          Mã giải đấu
          <input
            autoFocus
            className="mt-2 w-full rounded border p-3"
            maxLength={32}
            onChange={(e) => {
              setCode(e.target.value);
            }}
            value={code}
          />
        </label>
        <label className="mt-4 block font-semibold">
          Mã bảo mật riêng
          <input
            className="mt-2 w-full rounded border p-3"
            maxLength={72}
            onChange={(e) => {
              setPasscode(e.target.value);
            }}
            type="password"
            value={passcode}
          />
        </label>
        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="mt-6 w-full" disabled={login.isPending} type="submit">
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>
      {challenge ? (
        <ConfirmationDialog
          actionLabel="Có, tiếp tục"
          busy={takeover.isPending}
          description="Mã này đang được sử dụng trên thiết bị khác."
          onCancel={() => {
            setChallenge(null);
          }}
          onConfirm={() => {
            takeover.mutate();
          }}
          title="Tiếp quản phiên?"
        />
      ) : null}
    </main>
  );
}
