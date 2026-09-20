import { useEffect, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { MatchRole, TournamentOfficialRole } from '@martial-arts-scoring/shared-types';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/components/ui/toast';
import { getOrCreateDeviceId } from '@/features/match-access/device';
import {
  officialSessionQueryKey,
  useOfficialAssignment,
} from '@/features/match-access/official-realtime';
import {
  useMatchRealtime,
  type RealtimeRefereeIdentity,
} from '@/features/match-access/match-realtime';
import { InspectorConsole } from '@/features/match-access/inspector-console';
import { RefereeConsole } from '@/features/match-access/referee-console';
import { ApiClientError } from '@/services/api/client';
import { presentLifecycle, presentOfficialStatus } from '@/features/match-presentation';
import {
  officialAccessApi,
  type OfficialAssignment,
  type OfficialMatch,
  type OfficialSession,
} from '@/services/api/official-access';
import type { MatchAccessSession } from '@/services/api/match-access';

interface Props {
  readonly expectedRole: TournamentOfficialRole;
}
const sessionKey = officialSessionQueryKey;
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
function errorMessage(e: unknown) {
  return e instanceof ApiClientError && e.body.code === 'INVALID_OFFICIAL_CREDENTIALS'
    ? 'Mã giải đấu hoặc mã bảo mật riêng không đúng.'
    : e instanceof ApiClientError
      ? (e.body.message ?? 'Không thể thực hiện yêu cầu.')
      : 'Không thể kết nối đến máy chủ.';
}

function isEligible(match: OfficialMatch): boolean {
  return match.claimable && (match.lifecycle === 'NOT_STARTED' || match.lifecycle === 'SUSPENDED');
}

function claimabilityMessage(match: OfficialMatch): string {
  if (match.lifecycle === 'COMPLETED') return 'Trận đã hoàn thành, không thể nhận.';
  if (match.lifecycle === 'IN_PROGRESS') return 'Trận đang diễn ra, không thể nhận.';
  if (!match.claimable) return 'Đã có giám định khác nhận trận.';
  return match.lifecycle === 'SUSPENDED'
    ? 'Có thể nhận để tiếp tục trận tạm dừng.'
    : 'Có thể nhận trận.';
}

function assignmentErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'MATCH_ALREADY_CLAIMED':
      return 'Trận đã được giám định khác nhận.';
    case 'INSPECTOR_ALREADY_IN_MATCH':
      return 'Bạn đang được phân công ở một trận khác.';
    case 'REFEREE_INACTIVE':
      return 'Có trọng tài đang bị đình chỉ.';
    case 'REFEREE_NOT_AVAILABLE':
      return 'Trọng tài không còn sẵn sàng.';
    case 'MATCH_LIFECYCLE_MISMATCH':
    case 'STALE_ASSIGNMENT_SELECTION':
      return 'Trạng thái trận đã thay đổi. Vui lòng cập nhật lại.';
    case 'REFEREE_COUNT_MISMATCH':
      return 'Số lượng trọng tài chưa đúng yêu cầu.';
    case 'SESSION_REVOKED':
      return 'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.';
    default:
      return 'Không thể nhận trận. Vui lòng kiểm tra kết nối và thử lại.';
  }
}

function MatchListSkeleton() {
  return (
    <section aria-label="Đang tải danh sách trận" className="mt-5 grid gap-3 md:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div className="h-28 animate-pulse rounded-xl bg-muted" key={item} />
      ))}
    </section>
  );
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
        <p className="mt-4">{session.official.name}</p>
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
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
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
  const [refreshAnnouncement, setRefreshAnnouncement] = useState('');
  const matches = useQuery({
    queryKey: ['official-matches', session.tournament.id],
    queryFn: officialAccessApi.matches,
    staleTime: 0,
  });
  useEffect(() => {
    if (
      selected &&
      !matches.data?.matches.some((match) => match.id === selected.id && isEligible(match))
    ) {
      setSelected(null);
      setPicked([]);
    }
  }, [matches.data, selected]);
  const state = useQuery({
    queryKey: ['official-match', selected?.id],
    queryFn: () => {
      if (selected === null) throw new Error('A match must be selected before loading its state.');
      return officialAccessApi.state(selected.id);
    },
    enabled: !!selected,
    staleTime: 0,
  });
  const refresh = async () => {
    if (selected === null) return;
    const [matchesResult, stateResult] = await Promise.all([
      qc.fetchQuery({
        queryKey: ['official-matches', session.tournament.id],
        queryFn: officialAccessApi.matches,
        staleTime: 0,
      }),
      qc.fetchQuery({
        queryKey: ['official-match', selected.id],
        queryFn: () => officialAccessApi.state(selected.id),
        staleTime: 0,
      }),
    ]);
    const refreshedMatch = matchesResult.matches.find((match) => match.id === selected.id);
    if (!refreshedMatch || !isEligible(refreshedMatch)) {
      setSelected(null);
      setPicked([]);
      setRefreshAnnouncement('Trận đã không còn khả dụng để nhận.');
      return;
    }
    setSelected(refreshedMatch);
    const available = new Set(
      stateResult.referees
        .filter((referee) => referee.status === 'READY')
        .map((referee) => referee.id),
    );
    setPicked((previous) => {
      const next = previous.filter((id) => available.has(id));
      if (next.length !== previous.length)
        setRefreshAnnouncement('Một số trọng tài đã không còn sẵn sàng và đã được bỏ chọn.');
      else setRefreshAnnouncement('Đã cập nhật trạng thái trận và trọng tài.');
      return next;
    });
  };
  const take = useMutation({
    mutationFn: () => {
      if (selected === null) throw new Error('A match must be selected before taking it.');
      return officialAccessApi.take(selected.id, picked);
    },
    onSuccess: async () => {
      // A session snapshot is authoritative; the take response deliberately
      // does not let the browser invent an assignment identity.
      const snapshot = await officialAccessApi.session();
      qc.setQueryData(sessionKey, snapshot);
      toast({ title: 'Đã nhận trận', variant: 'success' });
    },
    onError: async (error) => {
      const details = error instanceof ApiClientError ? error.body.details : undefined;
      const code = error instanceof ApiClientError ? error.body.code : undefined;
      if (code === 'REFEREE_ALREADY_IN_MATCH' && details && typeof details === 'object') {
        const officialName =
          'officialName' in details && typeof details.officialName === 'string'
            ? details.officialName
            : 'này';
        const officialId =
          'officialId' in details && typeof details.officialId === 'string'
            ? details.officialId
            : null;
        if (officialId) setPicked((previous) => previous.filter((id) => id !== officialId));
        setConflict(`Trọng tài ${officialName} đã được phân công.`);
      } else toast({ title: assignmentErrorMessage(code), variant: 'destructive' });
      await refresh();
    },
  });
  const refreshing = state.isFetching || matches.isFetching;
  const required = state.data?.match.requiredRefereeCount ?? 0;
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">{session.tournament.name}</p>
          <h1 className="text-3xl font-black">Khu vực giám định</h1>
        </div>
        <Button disabled={pending} onClick={logout} type="button" variant="outline">
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
      </header>
      <p aria-live="polite" className="sr-only">
        {refreshAnnouncement}
      </p>
      {matches.isPending ? <MatchListSkeleton /> : null}
      {matches.data?.matches.length === 0 ? (
        <p className="mt-5 rounded-xl border p-5 text-muted-foreground">
          Chưa có trận nào sẵn sàng để nhận.
        </p>
      ) : null}
      <section aria-label="Danh sách trận" className="mt-5 grid gap-3 md:grid-cols-2">
        {matches.data?.matches.map((m) => (
          <button
            aria-pressed={selected?.id === m.id}
            className="min-h-28 rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!isEligible(m)}
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
            <p className="mt-2 text-xs font-semibold">{presentLifecycle(m.lifecycle).label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{claimabilityMessage(m)}</p>
          </button>
        ))}
      </section>
      {matches.isError ? (
        <p role="alert">
          Không tải được danh sách.{' '}
          <button className="underline" onClick={() => void matches.refetch()} type="button">
            Thử lại
          </button>
        </p>
      ) : null}
      {selected ? (
        <section className="mt-6 rounded-2xl border p-5">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-black">Chọn trọng tài · {selected.publicId}</h2>
            <Button
              disabled={refreshing || take.isPending}
              onClick={() => {
                void refresh();
              }}
              variant="secondary"
              type="button"
            >
              {refreshing ? 'Đang cập nhật…' : 'Cập nhật'}
            </Button>
          </div>
          <p aria-live="polite" className="mt-2 text-sm">
            Đã chọn {picked.length}/{required} trọng tài.
          </p>
          <fieldset className="mt-4 grid gap-2" disabled={take.isPending || refreshing}>
            <legend className="sr-only">Chọn trọng tài</legend>
            {state.data?.referees.map((r) => {
              const unavailable = r.status !== 'READY';
              return (
                <label
                  className="flex min-h-12 items-center justify-between rounded border p-3"
                  key={r.id}
                >
                  <span>
                    {r.name} ·{' '}
                    <span className="font-semibold">{presentOfficialStatus(r.status).label}</span>
                  </span>
                  <input
                    checked={picked.includes(r.id)}
                    aria-label={`Chọn trọng tài ${r.name}`}
                    disabled={unavailable || (!picked.includes(r.id) && picked.length >= required)}
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
            disabled={
              take.isPending || refreshing || !isEligible(selected) || picked.length !== required
            }
            onClick={() => {
              take.mutate();
            }}
            type="button"
          >
            {take.isPending ? 'Đang nhận trận…' : 'Nhận trận'}
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
  revoked,
}: {
  session: OfficialSession;
  assignment: OfficialAssignment;
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
  const officialRealtime = useOfficialAssignment(identity, () => {
    setRevoked(true);
  });
  const { assignment, connected } = officialRealtime;
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
      setRevoked(false);
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
      setRevoked(false);
    },
    onError: (e) => {
      setChallenge(null);
      setError(errorMessage(e));
    },
  });
  const logout = useMutation({
    mutationFn: officialAccessApi.logout,
    onSuccess: () => {
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
