import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { MatchLifecycle, TournamentOfficialRole } from '@/types/shared';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/components/ui/toast';
import { inputClassName } from '@/features/admin-management/presentation';
import { getOrCreateDeviceId } from '@/features/match-access/device';
import {
  officialSessionQueryKey,
  useOfficialAssignment,
} from '@/features/match-access/official-realtime';
import {
  useMatchRealtime,
  type RealtimeRefereeIdentity,
} from '@/features/match-access/match-realtime';
import { JudgeConsole } from '@/features/match-access/judge-console';
import { SupervisorConsole } from '@/features/match-access/supervisor-console';
import { ApiClientError } from '@/services/api/client';
import { presentLifecycle, presentOfficialStatus } from '@/features/match-presentation';
import {
  officialAccessApi,
  type OfficialAssignment,
  type OfficialMatch,
  type OfficialSession,
} from '@/services/api/official-access';

interface Props {
  readonly expectedRole: TournamentOfficialRole;
}
const sessionKey = officialSessionQueryKey;
const pathFor = (role: TournamentOfficialRole) =>
  role === TournamentOfficialRole.JUDGE ? '/giam-dinh' : '/giam-sat';
const realtimeRefereeIdentity = (assignment: OfficialAssignment): RealtimeRefereeIdentity =>
  assignment.role === TournamentOfficialRole.JUDGE && typeof assignment.judgePosition === 'number'
    ? {
        assignmentId: assignment.id,
        kind: 'official',
        judgePosition: assignment.judgePosition,
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
  return (
    match.claimable &&
    (match.lifecycle === MatchLifecycle.READY || match.lifecycle === MatchLifecycle.SUSPENDED)
  );
}

function claimabilityMessage(match: OfficialMatch): string {
  if (match.lifecycle === MatchLifecycle.COMPLETED) return 'Trận đã hoàn thành, không thể nhận.';
  if (match.lifecycle === MatchLifecycle.IN_PROGRESS) return 'Trận đang diễn ra, không thể nhận.';
  if (!match.claimable) return 'Đã có giám sát khác nhận trận.';
  return match.lifecycle === MatchLifecycle.SUSPENDED
    ? 'Có thể nhận để tiếp tục trận tạm dừng.'
    : 'Có thể nhận trận.';
}

function assignmentErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'MATCH_ALREADY_CLAIMED':
      return 'Trận đã được giám sát khác nhận.';
    case 'SUPERVISOR_ALREADY_IN_MATCH':
      return 'Bạn đang được phân công ở một trận khác.';
    case 'JUDGE_INACTIVE':
      return 'Có giám định đang bị đình chỉ.';
    case 'JUDGE_NOT_AVAILABLE':
      return 'Giám định không còn sẵn sàng.';
    case 'MATCH_LIFECYCLE_MISMATCH':
    case 'STALE_ASSIGNMENT_SELECTION':
      return 'Trạng thái trận đã thay đổi. Vui lòng cập nhật lại.';
    case 'JUDGE_COUNT_MISMATCH':
      return 'Số lượng giám định chưa đúng yêu cầu.';
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
  logoutError,
}: {
  session: OfficialSession;
  connected: boolean;
  logout: () => void;
  pending: boolean;
  logoutError: string | null;
}) {
  return (
    <main className="arena-background grid min-h-dvh w-full place-items-center p-4">
      <section
        aria-live="polite"
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-card p-7 shadow-[0_12px_36px_rgba(0,0,0,0.28)] sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{session.tournament.name}</p>
          <Badge dot tone={connected ? 'success' : 'warning'}>
            {connected ? (
              <Wifi aria-hidden="true" className="size-3.5" />
            ) : (
              <WifiOff aria-hidden="true" className="size-3.5" />
            )}
            {connected ? 'Trực tuyến' : 'Ngoại tuyến'}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Đang chờ phân công</h1>
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-1.5 text-sm font-medium text-foreground">
          <Smartphone aria-hidden="true" className="size-4 text-muted-foreground" />
          {session.official.name}
        </p>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {connected
            ? 'Đã kết nối. Vui lòng chờ giám sát phân công trận đấu.'
            : 'Ngoại tuyến. Đang chờ kết nối để nhận phân công.'}
        </p>
        <Button
          className="mt-6"
          disabled={pending}
          onClick={logout}
          type="button"
          variant="destructive-gradient"
        >
          <LogOut aria-hidden="true" className="size-4" />
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
        {logoutError ? (
          <Alert className="mt-4" tone="error">
            <p role="alert">{logoutError}</p>
          </Alert>
        ) : null}
      </section>
    </main>
  );
}

function SupervisorAssignment({
  session,
  logout,
  pending,
  logoutError,
}: {
  session: OfficialSession;
  logout: () => void;
  pending: boolean;
  logoutError: string | null;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<OfficialMatch | null>(null);
  const [weightClassId, setWeightClassId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [refreshAnnouncement, setRefreshAnnouncement] = useState('');
  const assignmentPanelRef = useRef<HTMLElement>(null);
  const selectedMatchRef = useRef<HTMLButtonElement>(null);
  const selectedId = selected?.id;
  useEffect(() => {
    // Desktop keeps the picker beside the list; mobile still needs to reveal it.
    if (!selectedId) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches)
      return;
    const panel = assignmentPanelRef.current;
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    panel?.focus({ preventScroll: true });
  }, [selectedId]);
  const matches = useQuery({
    queryKey: ['official-matches', session.tournament.id],
    queryFn: officialAccessApi.matches,
    staleTime: 0,
    refetchInterval: 5_000,
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
      return selected.fixtureId
        ? officialAccessApi.fixtureState(selected.fixtureId)
        : officialAccessApi.state(selected.id);
    },
    enabled: !!selected,
    staleTime: 0,
    refetchInterval: 5_000,
  });
  const { refetch: refetchState } = state;
  useEffect(() => {
    if (!selected) return;
    const current = matches.data?.matches.find((match) => match.id === selected.id);
    if (current && current.requiredJudgeCount !== selected.requiredJudgeCount) {
      setSelected(current);
      void refetchState();
    }
  }, [matches.data, selected, refetchState]);
  useEffect(() => {
    const count = state.data?.match.requiredJudgeCount;
    if (count === undefined) return;
    setPicked((previous) => (previous.length > count ? previous.slice(0, count) : previous));
  }, [state.data?.match.requiredJudgeCount]);
  const refresh = async () => {
    if (selected === null) return;
    const [matchesResult, stateResult] = await Promise.all([
      qc.query({
        queryKey: ['official-matches', session.tournament.id],
        queryFn: officialAccessApi.matches,
        staleTime: 0,
      }),
      qc.query({
        queryKey: ['official-match', selected.id],
        queryFn: () =>
          selected.fixtureId
            ? officialAccessApi.fixtureState(selected.fixtureId)
            : officialAccessApi.state(selected.id),
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
        setRefreshAnnouncement('Một số giám định đã không còn sẵn sàng và đã được bỏ chọn.');
      else setRefreshAnnouncement('Đã cập nhật trạng thái trận và giám định.');
      return next;
    });
  };
  const take = useMutation({
    mutationFn: () => {
      if (selected === null) throw new Error('A match must be selected before taking it.');
      return selected.fixtureId
        ? officialAccessApi.takeFixture(selected.fixtureId, picked)
        : officialAccessApi.take(selected.id, picked);
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
      if (code === 'JUDGE_ALREADY_IN_MATCH' && details && typeof details === 'object') {
        const officialName =
          'officialName' in details && typeof details.officialName === 'string'
            ? details.officialName
            : 'này';
        const officialId =
          'officialId' in details && typeof details.officialId === 'string'
            ? details.officialId
            : null;
        if (officialId) setPicked((previous) => previous.filter((id) => id !== officialId));
        setConflict(`Giám định ${officialName} đã được phân công.`);
      } else toast({ title: assignmentErrorMessage(code), variant: 'destructive' });
      await refresh();
    },
  });
  const refreshing = state.isFetching || matches.isFetching;
  const required = state.data?.match.requiredJudgeCount ?? 0;
  const weightClasses = new Map<string, { name: string; matches: OfficialMatch[] }>();
  for (const match of matches.data?.matches ?? []) {
    const id = match.weightClass?.id ?? 'unclassified';
    if (!weightClasses.has(id)) {
      weightClasses.set(id, { name: match.weightClass?.name ?? 'Chưa phân hạng cân', matches: [] });
    }
    weightClasses.get(id)?.matches.push(match);
  }
  const tabs = [...weightClasses.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name, 'vi'),
  );
  const activeTab =
    weightClassId && weightClasses.has(weightClassId) ? weightClassId : (tabs[0]?.[0] ?? '');
  const rounds = new Map<number, OfficialMatch[]>();
  for (const match of weightClasses.get(activeTab)?.matches ?? []) {
    const round = match.roundNumber ?? 0;
    if (!rounds.has(round)) rounds.set(round, []);
    rounds.get(round)?.push(match);
  }
  const roundGroups = [...rounds.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <header className="app-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium text-muted-foreground">{session.tournament.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">Khu vực giám sát</h1>
          </div>
        </div>
        <Button disabled={pending} onClick={logout} type="button" variant="destructive-gradient">
          <LogOut aria-hidden="true" className="size-4" />
          {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
        </Button>
        {logoutError ? (
          <Alert className="w-full" tone="error">
            <p role="alert">{logoutError}</p>
          </Alert>
        ) : null}
      </header>
      <p aria-live="polite" className="sr-only">
        {refreshAnnouncement}
      </p>
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          {matches.isPending ? <MatchListSkeleton /> : null}
          {matches.data?.matches.length === 0 ? (
            <p className="mt-5 rounded-xl border p-5 text-muted-foreground">
              Chưa có trận nào sẵn sàng để nhận.
            </p>
          ) : null}
          {tabs.length > 0 ? (
            <>
              <div
                aria-label="Hạng cân"
                className="mt-5 flex gap-2 overflow-x-auto border-b pb-2"
                role="tablist"
                onKeyDown={(event) => {
                  const buttons = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                  );
                  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === 'ArrowRight'
                      ? (index + 1) % buttons.length
                      : event.key === 'ArrowLeft'
                        ? (index - 1 + buttons.length) % buttons.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? buttons.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  buttons[next]?.focus();
                  buttons[next]?.click();
                }}
              >
                {tabs.map(([id, group]) => (
                  <button
                    aria-controls={`official-weight-panel-${id}`}
                    aria-selected={activeTab === id}
                    className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-[color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring ${activeTab === id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    id={`official-weight-tab-${id}`}
                    key={id}
                    onClick={() => {
                      setWeightClassId(id);
                      setSelected(null);
                      setPicked([]);
                      setConflict(null);
                    }}
                    role="tab"
                    tabIndex={activeTab === id ? 0 : -1}
                    type="button"
                  >
                    {group.name} ({group.matches.length})
                  </button>
                ))}
              </div>
              <section
                aria-label="Danh sách trận"
                aria-labelledby={`official-weight-tab-${activeTab}`}
                id={`official-weight-panel-${activeTab}`}
                role="tabpanel"
                tabIndex={0}
              >
                {roundGroups.map(([round, group]) => (
                  <section
                    className="mt-5"
                    key={round}
                    aria-label={round ? `Vòng ${String(round)}` : 'Trận ngoài nhánh đấu'}
                  >
                    <h2 className="mb-3 border-b pb-2 text-lg font-bold">
                      {round ? `Vòng ${String(round)}` : 'Trận ngoài nhánh đấu'}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {group.length} trận
                      </span>
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[...group]
                        .sort(
                          (a, b) =>
                            (a.position ?? 0) - (b.position ?? 0) ||
                            a.publicId.localeCompare(b.publicId),
                        )
                        .map((m) => (
                          <button
                            ref={selected?.id === m.id ? selectedMatchRef : undefined}
                            aria-pressed={selected?.id === m.id}
                            className={`min-h-28 rounded-xl border p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${selected?.id === m.id ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'border-foreground/[0.08] bg-card hover:border-foreground/[0.16] hover:bg-muted/30'}`}
                            disabled={!isEligible(m)}
                            key={m.id}
                            onClick={() => {
                              setPicked([]);
                              setSelected(m);
                              setConflict(null);
                            }}
                            type="button"
                          >
                            <strong>{m.publicId}</strong>
                            <p className="mt-1 text-sm">
                              {m.athletes.map((athlete, index) => (
                                <span key={athlete.color}>
                                  {index > 0 ? ' · ' : null}
                                  <span
                                    className={
                                      athlete.color === 'RED'
                                        ? 'font-semibold text-red-700'
                                        : athlete.color === 'BLUE'
                                          ? 'font-semibold text-blue-700'
                                          : 'font-semibold'
                                    }
                                  >
                                    {athlete.name}
                                  </span>
                                </span>
                              ))}
                              {' · '}Cần {m.requiredJudgeCount} giám định
                            </p>
                            <p className="mt-2 text-xs font-semibold">
                              {presentLifecycle(m.lifecycle).label}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {claimabilityMessage(m)}
                            </p>
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
              </section>
            </>
          ) : null}
          {matches.isError ? (
            <p role="alert">
              Không tải được danh sách.{' '}
              <button className="underline" onClick={() => void matches.refetch()} type="button">
                Thử lại
              </button>
            </p>
          ) : null}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-6" aria-label="Phân công giám định">
          {selected ? (
            <section
              aria-label={`Chọn giám định cho trận ${selected.publicId}`}
              className="app-card scroll-mt-4 p-5 outline-none sm:p-6"
              ref={assignmentPanelRef}
              tabIndex={-1}
            >
              <p className="mb-3 text-sm font-semibold text-primary">
                {selected.weightClass?.name ?? 'Chưa phân hạng cân'}
                {selected.roundNumber ? ` · Vòng ${String(selected.roundNumber)}` : ''}
              </p>
              <Button
                className="mb-3 lg:hidden"
                variant="secondary"
                type="button"
                onClick={() => {
                  selectedMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  selectedMatchRef.current?.focus({ preventScroll: true });
                }}
              >
                Chọn trận khác
              </Button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="min-w-0 break-words text-xl font-black tracking-tight">
                  Chọn giám định · {selected.publicId}
                </h2>
                <Button
                  disabled={refreshing || take.isPending}
                  onClick={() => {
                    void refresh();
                  }}
                  size="sm"
                  variant="outline"
                  type="button"
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  />
                  {refreshing ? 'Đang cập nhật…' : 'Cập nhật'}
                </Button>
              </div>
              <p aria-live="polite" className="mt-2 text-sm font-semibold text-muted-foreground">
                Đã chọn {picked.length}/{required} giám định.
              </p>
              <fieldset
                className="mt-4 grid max-h-[50dvh] gap-2 overflow-y-auto overscroll-contain pr-1"
                disabled={take.isPending || refreshing}
              >
                <legend className="sr-only">Chọn giám định</legend>
                {state.data?.referees.map((r) => {
                  const unavailable = r.status !== 'READY';
                  const checked = picked.includes(r.id);
                  return (
                    <label
                      className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                        checked
                          ? 'border-primary bg-sky-50/80'
                          : unavailable
                            ? 'cursor-not-allowed border-border/60 bg-muted/40 opacity-65'
                            : 'border-border/80 bg-white hover:border-primary/40 hover:bg-sky-50/40'
                      }`}
                      key={r.id}
                    >
                      <span className="min-w-0 break-words text-sm">
                        <span className="font-semibold text-foreground">{r.name}</span> ·{' '}
                        <span className="font-semibold text-muted-foreground">
                          {presentOfficialStatus(r.status).label}
                        </span>
                      </span>
                      <input
                        checked={checked}
                        aria-label={`Chọn giám định ${r.name}`}
                        disabled={unavailable || (!checked && picked.length >= required)}
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
                className="mt-5 w-full"
                disabled={
                  take.isPending ||
                  refreshing ||
                  !isEligible(selected) ||
                  picked.length !== required
                }
                onClick={() => {
                  take.mutate();
                }}
                type="button"
              >
                {take.isPending ? 'Đang nhận trận…' : 'Nhận trận'}
              </Button>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed bg-muted/30 p-6 text-center">
              <h2 className="text-lg font-bold">Chọn giám định</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Chọn một trận trong danh sách để phân công giám định và nhận trận.
              </p>
            </section>
          )}
        </aside>
      </div>
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
  assignment,
  onMatchExitAcknowledged,
  revoked,
  notice,
}: {
  assignment: OfficialAssignment;
  onMatchExitAcknowledged: () => void;
  revoked: () => void;
  notice: string | null;
}) {
  const realtime = useMatchRealtime({
    keepSocketConnected: true,
    matchPublicId: assignment.match.publicId,
    refereeIdentity: realtimeRefereeIdentity(assignment),
    onAuthenticationRequired: revoked,
    onMatchExitAcknowledged,
    onSessionRevoked: revoked,
  });
  return (
    <>
      {assignment.role === TournamentOfficialRole.JUDGE ? (
        <JudgeConsole realtime={realtime} />
      ) : (
        <SupervisorConsole realtime={realtime} />
      )}
      {notice ? (
        <p
          className="fixed inset-x-4 top-4 z-[60] mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 shadow-lg"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
    </>
  );
}

function RoleMismatch({
  activeRole,
  expectedRole,
  returnToActiveRole,
  logout,
  pending,
  logoutError,
}: {
  activeRole: TournamentOfficialRole;
  expectedRole: TournamentOfficialRole;
  returnToActiveRole: () => void;
  logout: () => void;
  pending: boolean;
  logoutError: string | null;
}) {
  const expectedLabel = expectedRole === TournamentOfficialRole.JUDGE ? 'giám định' : 'giám sát';
  const activeLabel = activeRole === TournamentOfficialRole.JUDGE ? 'giám định' : 'giám sát';

  return (
    <main className="arena-background grid min-h-dvh w-full place-items-center p-4">
      <section className="w-full max-w-lg rounded-3xl border border-white/20 bg-white/95 p-7 shadow-2xl shadow-slate-950/35 backdrop-blur-xl sm:p-9">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-primary">
          Khu vực {expectedLabel}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Phiên không đúng vai trò</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Bạn đang có phiên {activeLabel}. Đăng xuất phiên đó để đăng nhập vào khu vực{' '}
          {expectedLabel}.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={returnToActiveRole} type="button">
            Về khu vực {activeLabel}
          </Button>
          <Button disabled={pending} onClick={logout} type="button" variant="destructive-gradient">
            <LogOut aria-hidden="true" className="size-4" />
            {pending ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </Button>
        </div>
        {logoutError ? (
          <Alert className="mt-4" tone="error">
            <p role="alert">{logoutError}</p>
          </Alert>
        ) : null}
      </section>
    </main>
  );
}

export function MatchAccessPage({ expectedRole }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    return token;
  });
  const linkAttempted = useRef(false);
  const [deviceId] = useState(getOrCreateDeviceId);
  const [code, setCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
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
  const { acknowledgeAssignmentRelease, assignment, connected } = officialRealtime;
  const login = useMutation({
    mutationFn: () =>
      linkToken
        ? officialAccessApi.tokenLogin({ token: linkToken, deviceId, expectedRole })
        : officialAccessApi.login({
            tournamentCode: code.trim().toUpperCase(),
            privatePasscode: passcode.trim(),
            deviceId,
            expectedRole,
          }),
    onSuccess: (x) => {
      setLinkToken(null);
      void nav(pathFor(x.session.official.role), { replace: true });
      qc.removeQueries({ queryKey: ['official-matches'] });
      qc.removeQueries({ queryKey: ['official-match'] });
      qc.setQueryData(sessionKey, x);
      setRevoked(false);
    },
    onError: (e) => {
      if (
        e instanceof ApiClientError &&
        e.status === 409 &&
        typeof e.body.takeoverToken === 'string'
      )
        setChallenge(e.body.takeoverToken);
      else {
        setLinkToken(null);
        setError(errorMessage(e));
      }
    },
  });
  const takeover = useMutation({
    mutationFn: () =>
      linkToken
        ? officialAccessApi.tokenLogin({
            token: linkToken,
            deviceId,
            expectedRole,
            takeoverToken:
              challenge ??
              (() => {
                throw new Error('A takeover challenge is required.');
              })(),
          })
        : officialAccessApi.takeover({
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
      setLinkToken(null);
      void nav(pathFor(x.session.official.role), { replace: true });
      qc.removeQueries({ queryKey: ['official-matches'] });
      qc.removeQueries({ queryKey: ['official-match'] });
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
      setLogoutError(null);
      qc.removeQueries({ queryKey: ['official-matches'] });
      qc.removeQueries({ queryKey: ['official-match'] });
      qc.setQueryData(sessionKey, null);
    },
    onError: async (logoutFailure) => {
      if (
        logoutFailure instanceof ApiClientError &&
        logoutFailure.status === 409 &&
        logoutFailure.body.code === 'OFFICIAL_IN_MATCH_LOGOUT_FORBIDDEN'
      ) {
        try {
          const refreshed = await officialAccessApi.session();
          qc.setQueryData(sessionKey, refreshed);
          setLogoutError(
            'Bạn đã được phân công vào trận trước khi yêu cầu đăng xuất được xử lý. Phiên vẫn được giữ.',
          );
        } catch {
          setLogoutError(
            'Không thể đăng xuất vì bạn đang được phân công vào trận. Phiên vẫn được giữ; đang chờ đồng bộ lại.',
          );
          void qc.invalidateQueries({ queryKey: sessionKey });
        }
        return;
      }
      setLogoutError(errorMessage(logoutFailure));
    },
  });
  const loginFromLink = login.mutate;
  useEffect(() => {
    if (linkToken)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    if (
      linkToken &&
      !session.isPending &&
      !session.isError &&
      !identity &&
      !linkAttempted.current
    ) {
      linkAttempted.current = true;
      loginFromLink();
    }
  }, [linkToken, session.isPending, session.isError, identity, loginFromLink]);
  if (session.isPending || (linkToken && login.isPending))
    return (
      <p className="p-8" aria-live="polite">
        Đang khôi phục phiên đăng nhập…
      </p>
    );
  if (identity && identity.official.role !== expectedRole)
    return (
      <RoleMismatch
        activeRole={identity.official.role}
        expectedRole={expectedRole}
        returnToActiveRole={() => {
          void nav(pathFor(identity.official.role));
        }}
        logout={() => {
          setLogoutError(null);
          logout.mutate();
        }}
        logoutError={logoutError}
        pending={logout.isPending}
      />
    );
  if (identity && assignment)
    return (
      <AssignedConsole
        assignment={assignment}
        onMatchExitAcknowledged={() => {
          acknowledgeAssignmentRelease(assignment);
        }}
        revoked={() => {
          setRevoked(true);
          qc.setQueryData(sessionKey, null);
        }}
        notice={logoutError}
      />
    );
  if (identity)
    return identity.official.role === TournamentOfficialRole.SUPERVISOR ? (
      <SupervisorAssignment
        logout={() => {
          setLogoutError(null);
          logout.mutate();
        }}
        pending={logout.isPending}
        logoutError={logoutError}
        session={identity}
      />
    ) : (
      <Waiting
        connected={connected}
        logout={() => {
          setLogoutError(null);
          logout.mutate();
        }}
        pending={logout.isPending}
        logoutError={logoutError}
        session={identity}
      />
    );
  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!linkToken && (!code.trim() || !passcode.trim())) {
      setError('Vui lòng nhập mã giải đấu và mã bảo mật riêng.');
      return;
    }
    login.mutate();
  };
  const isJudge = expectedRole === TournamentOfficialRole.JUDGE;
  return (
    <main className="arena-background grid min-h-dvh w-full place-items-center p-4">
      <form
        className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-7 shadow-[0_12px_36px_rgba(0,0,0,0.28)] sm:p-8"
        onSubmit={submit}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {isJudge ? (
              <Smartphone aria-hidden="true" className="size-4" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-4" />
            )}
            {isJudge ? 'Khu vực giám định' : 'Khu vực giám sát'}
          </span>
          <Link
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            to="/"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Trang chủ
          </Link>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {revoked ? 'Phiên đã bị thu hồi' : 'Đăng nhập'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nhập mã giải đấu và mã bảo mật riêng do ban tổ chức cấp.
        </p>
        {revoked ? (
          <Alert className="mt-4" role="alert" tone="warning">
            Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.
          </Alert>
        ) : null}
        <label className="form-field mt-6 block">
          Mã giải đấu
          <input
            autoFocus
            className={`${inputClassName} font-mono uppercase tracking-widest`}
            maxLength={32}
            onChange={(e) => {
              setCode(e.target.value);
            }}
            placeholder="VD: TOUR2026"
            value={code}
          />
        </label>
        <label className="form-field mt-4 block">
          Mã bảo mật riêng
          <input
            className={inputClassName}
            maxLength={72}
            onChange={(e) => {
              setPasscode(e.target.value);
            }}
            placeholder="Nhập mã bảo mật"
            type="password"
            value={passcode}
          />
        </label>
        {error ? (
          <Alert className="mt-4" tone="error">
            <p role="alert">{error}</p>
          </Alert>
        ) : null}
        <Button className="mt-6 w-full" disabled={login.isPending} size="lg" type="submit">
          <LogIn aria-hidden="true" className="size-4" />
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
            setLinkToken(null);
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
