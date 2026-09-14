import { useEffect, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { getOrCreateDeviceId } from '@/features/match-access/device';
import { ApiClientError } from '@/services/api/client';
import {
  officialAccessApi,
  type OfficialMatch,
  type OfficialSession,
} from '@/services/api/official-access';
import { MatchRole, TournamentOfficialRole } from '@/types/shared';

interface Props {
  readonly expectedRole: TournamentOfficialRole | MatchRole;
}
const sessionKey = ['official-access', 'session'] as const;
const pathFor = (role: TournamentOfficialRole) =>
  role === TournamentOfficialRole.REFEREE ? '/trong-tai' : '/giam-dinh';
function message(error: unknown) {
  return error instanceof ApiClientError && error.body.code === 'INVALID_OFFICIAL_CREDENTIALS'
    ? 'Mã giải đấu hoặc mã bảo mật riêng không đúng.'
    : error instanceof ApiClientError
      ? (error.body.message ?? 'Không thể thực hiện yêu cầu.')
      : 'Không thể kết nối đến máy chủ.';
}

function Waiting({
  session,
  logout,
  pending,
}: {
  session: OfficialSession;
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
          Đã kết nối. Vui lòng chờ giám định phân công trận đấu.
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

function Inspector({
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
      if (selected === null) {
        throw new Error('A match must be selected before loading its state.');
      }
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
    mutationFn: (id: string) => officialAccessApi.claim(id),
    onSuccess: refresh,
  });
  const confirm = useMutation({
    mutationFn: () => {
      if (selected === null) {
        throw new Error('A match must be selected before confirming referees.');
      }
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
        {matches.data?.matches.map((match) => (
          <button
            className="rounded-xl border p-4 text-left focus-visible:ring-2"
            key={match.id}
            onClick={() => {
              setSelected(match);
              setConflict(null);
            }}
            type="button"
          >
            <strong>{match.publicId}</strong>
            <p className="mt-1 text-sm">
              {match.athletes.map((a) => a.name).join(' · ')} · Cần {match.requiredRefereeCount}{' '}
              trọng tài
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {match.claimable ? 'Có thể nhận trận' : 'Đã có giám định khác nhận'}
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
          <fieldset className="mt-4 grid gap-2" disabled={confirm.isPending}>
            <legend className="sr-only">Chọn trọng tài</legend>
            {state.data?.referees.map((referee) => {
              const unavailable =
                !referee.isActive ||
                (!!referee.assignedMatchId && referee.assignedMatchId !== selected.id);
              return (
                <label
                  className="flex items-center justify-between rounded border p-3"
                  key={referee.id}
                >
                  <span>
                    {referee.name}{' '}
                    {!referee.isActive
                      ? '· DISABLED'
                      : unavailable
                        ? '· Đang trong trận khác'
                        : '· READY'}
                  </span>
                  <input
                    checked={picked.includes(referee.id)}
                    disabled={unavailable}
                    onChange={() => {
                      setPicked((old) =>
                        old.includes(referee.id)
                          ? old.filter((id) => id !== referee.id)
                          : old.length < required
                            ? [...old, referee.id]
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

export function MatchAccessPage({ expectedRole }: Props) {
  const expectedOfficialRole =
    expectedRole === MatchRole.REFEREE
      ? TournamentOfficialRole.REFEREE
      : TournamentOfficialRole.INSPECTOR;
  const nav = useNavigate();
  const qc = useQueryClient();
  const [deviceId] = useState(getOrCreateDeviceId);
  const [code, setCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
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
  const login = useMutation({
    mutationFn: () =>
      officialAccessApi.login({
        tournamentCode: code.trim().toUpperCase(),
        privatePasscode: passcode.trim(),
        deviceId,
        expectedRole: expectedOfficialRole,
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
      else setError(message(e));
    },
  });
  const takeover = useMutation({
    mutationFn: () => {
      if (challenge === null) {
        throw new Error('A takeover challenge is required.');
      }
      return officialAccessApi.takeover({
        tournamentCode: code.trim().toUpperCase(),
        privatePasscode: passcode.trim(),
        deviceId,
        expectedRole: expectedOfficialRole,
        takeoverToken: challenge,
      });
    },
    onSuccess: (x) => {
      qc.setQueryData(sessionKey, x);
      setChallenge(null);
    },
    onError: (e) => {
      setChallenge(null);
      setError(message(e));
    },
  });
  const logout = useMutation({
    mutationFn: officialAccessApi.logout,
    onSuccess: () => qc.setQueryData(sessionKey, null),
  });
  if (session.isPending)
    return (
      <p className="p-8" aria-live="polite">
        Đang khôi phục phiên đăng nhập…
      </p>
    );
  const identity = session.data?.session;
  if (identity && identity.official.role !== expectedOfficialRole)
    return <Navigate replace to={pathFor(identity.official.role)} />;
  if (identity)
    return identity.official.role === TournamentOfficialRole.INSPECTOR ? (
      <Inspector
        logout={() => {
          logout.mutate();
        }}
        pending={logout.isPending}
        session={identity}
      />
    ) : (
      <Waiting
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
          {expectedOfficialRole === TournamentOfficialRole.REFEREE
            ? 'Khu vực trọng tài'
            : 'Khu vực giám định'}
        </p>
        <h1 className="mt-2 text-3xl font-black">Đăng nhập</h1>
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
