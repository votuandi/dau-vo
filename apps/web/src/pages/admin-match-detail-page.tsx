import { useEffect, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { GeneratedAccessCodesPanel } from '@/components/generated-access-codes-panel';
import { ClipboardCopyButton } from '@/components/ui/clipboard-copy-button';
import { AdminMatchMonitoring } from '@/features/admin-management/admin-match-monitoring';
import { Button } from '@/components/ui/button';
import {
  accessCodeRoleLabels,
  accessCodeRoles,
  formatDateTime,
  getApiErrorMessage,
  inputClassName,
  matchStatusLabels,
  millisecondsToSeconds,
  notifyMutationError,
  notifyMutationSuccess,
  secondsToMilliseconds,
} from '@/features/admin-management/presentation';
import {
  matchQueryKeys,
  matchQueryOptions,
  tournamentAthletesQueryOptions,
  tournamentQueryKeys,
  tournamentWeightClassesQueryOptions,
} from '@/features/admin-management/queries';
import {
  adminManagementApi,
  type AdminMatch,
  type GeneratedAccessCode,
  type MatchAthleteInput,
  type UpdateMatchInput,
} from '@/services/api/admin-management';
import { AthleteColor, type MatchAccessRole } from '@/types/shared';
import { useAdminAccessContext } from '@/features/auth/admin-access';
import { RosterAthleteSelector } from '@/features/admin-management/roster-athlete-selector';

function MatchEditor({
  match,
  isReadOnly,
}: {
  readonly match: AdminMatch;
  readonly isReadOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [roundDurationSeconds, setRoundDurationSeconds] = useState(
    millisecondsToSeconds(match.roundDurationMs),
  );
  const [breakDurationSeconds, setBreakDurationSeconds] = useState(
    millisecondsToSeconds(match.breakDurationMs),
  );
  const [weightClassId, setWeightClassId] = useState(match.weightClassId ?? '');
  const [redAthleteId, setRedAthleteId] = useState<string | null>(
    () => match.athletes.find((athlete) => athlete.color === AthleteColor.RED)?.athleteId ?? null,
  );
  const [blueAthleteId, setBlueAthleteId] = useState<string | null>(
    () => match.athletes.find((athlete) => athlete.color === AthleteColor.BLUE)?.athleteId ?? null,
  );
  const weightsQuery = useQuery(tournamentWeightClassesQueryOptions(match.tournamentId));
  const athletesQuery = useQuery({
    ...tournamentAthletesQueryOptions(match.tournamentId, {
      isActive: true,
      page: 1,
      pageSize: 100,
      ...(weightClassId ? { weightClassId } : {}),
    }),
    enabled: Boolean(weightClassId),
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (input: UpdateMatchInput) => adminManagementApi.updateMatch(match.id, input),
    onSuccess: (response) => {
      queryClient.setQueryData(matchQueryKeys.detail(match.id), response);
      notifyMutationSuccess('Cập nhật trận đấu thành công.');
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.matches(match.tournamentId),
      });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật trận đấu.');
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.athletes(match.tournamentId, {}),
      });
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.reset();

    const roundDurationMs = secondsToMilliseconds(roundDurationSeconds);
    const breakDurationMs = secondsToMilliseconds(breakDurationSeconds);
    if (roundDurationMs === null || breakDurationMs === null) {
      setValidationError('Thời lượng phải là số giây nguyên lớn hơn 0.');
      return;
    }
    if (canReplace && (!redAthleteId || !blueAthleteId || redAthleteId === blueAthleteId)) {
      setValidationError('Chọn hai vận động viên khác nhau trong cùng hạng cân.');
      return;
    }

    setValidationError(null);
    updateMutation.mutate({
      roundDurationMs,
      breakDurationMs,
      ...(canReplace && redAthleteId && blueAthleteId
        ? {
            athletes: [
              { color: AthleteColor.RED, athleteId: redAthleteId },
              { color: AthleteColor.BLUE, athleteId: blueAthleteId },
            ] as [MatchAthleteInput, MatchAthleteInput],
          }
        : {}),
    });
  }

  const activeWeightClasses =
    weightsQuery.data?.weightClasses.filter(({ isActive }) => isActive) ?? [];
  const eligibleAthletes = athletesQuery.data?.items ?? [];
  const selectedWeightClass = activeWeightClasses.find(({ id }) => id === weightClassId);
  const isLegacy =
    match.weightClassId === null || match.athletes.some(({ athleteId }) => athleteId === null);
  const canReplace = match.status === 'WAITING' && !isLegacy;
  useEffect(() => {
    const ids = new Set(eligibleAthletes.map(({ id }) => id));
    if (redAthleteId && !ids.has(redAthleteId)) setRedAthleteId(null);
    if (blueAthleteId && !ids.has(blueAthleteId)) setBlueAthleteId(null);
  }, [eligibleAthletes, redAthleteId, blueAthleteId]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-black tracking-tight">Cấu hình trận đấu</h2>
      <form className="mt-5 space-y-6" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold">Trạng thái</p>
            <div className="mt-2 flex h-11 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-bold">
              {matchStatusLabels[match.status]}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Trạng thái được điều khiển bởi giám định viên trong trận đấu.
            </p>
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="round-duration">
              Thời lượng hiệp (giây)
            </label>
            <input
              className={inputClassName}
              disabled={updateMutation.isPending || isReadOnly}
              id="round-duration"
              min={1}
              onChange={(event) => {
                setRoundDurationSeconds(event.target.value);
              }}
              step={1}
              type="number"
              value={roundDurationSeconds}
            />
          </div>
          <div>
            <label className="text-sm font-semibold" htmlFor="break-duration">
              Thời gian nghỉ (giây)
            </label>
            <input
              className={inputClassName}
              disabled={updateMutation.isPending || isReadOnly}
              id="break-duration"
              min={1}
              onChange={(event) => {
                setBreakDurationSeconds(event.target.value);
              }}
              step={1}
              type="number"
              value={breakDurationSeconds}
            />
          </div>
        </div>

        <fieldset
          className="space-y-4"
          disabled={updateMutation.isPending || isReadOnly || !canReplace}
        >
          <legend className="mb-3 text-sm font-bold">Vận động viên</legend>
          {canReplace ? (
            <>
              <label className="block text-sm font-semibold" htmlFor="edit-match-weight-class">
                Hạng cân
              </label>
              <select
                className={inputClassName}
                id="edit-match-weight-class"
                onChange={(event) => {
                  setWeightClassId(event.target.value);
                  setRedAthleteId(null);
                  setBlueAthleteId(null);
                }}
                value={weightClassId}
              >
                {activeWeightClasses.map((weightClass) => (
                  <option key={weightClass.id} value={weightClass.id}>
                    {weightClass.name}
                  </option>
                ))}
              </select>
              <div className="grid gap-4 md:grid-cols-2">
                <RosterAthleteSelector
                  athletes={eligibleAthletes}
                  color={AthleteColor.RED}
                  disabled={eligibleAthletes.length < 2}
                  label="Góc Đỏ (RED)"
                  loading={athletesQuery.isPending}
                  onChange={(id) => setRedAthleteId(id || null)}
                  selectedAthleteId={redAthleteId}
                  weightClassName={selectedWeightClass?.name}
                />
                <RosterAthleteSelector
                  athletes={eligibleAthletes}
                  color={AthleteColor.BLUE}
                  disabled={eligibleAthletes.length < 2}
                  excludedAthleteId={redAthleteId}
                  label="Góc Xanh (BLUE)"
                  loading={athletesQuery.isPending}
                  onChange={(id) => setBlueAthleteId(id || null)}
                  selectedAthleteId={blueAthleteId}
                  weightClassName={selectedWeightClass?.name}
                />
              </div>
            </>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {isLegacy
                ? 'Trận đấu cũ không có liên kết danh sách đăng ký nên không thể thay vận động viên.'
                : 'Không thể thay vận động viên sau khi trận đã có hoạt động hoặc không còn ở trạng thái chờ.'}
            </p>
          )}
        </fieldset>

        {validationError ? (
          <p className="text-sm text-destructive" role="alert">
            {validationError}
          </p>
        ) : null}
        {updateMutation.isError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {getApiErrorMessage(updateMutation.error, 'Không thể cập nhật trận đấu.')}
          </p>
        ) : null}
        {updateMutation.isSuccess ? (
          <p className="text-sm font-semibold text-emerald-700" role="status">
            Đã lưu thông tin trận đấu.
          </p>
        ) : null}

        <Button disabled={updateMutation.isPending || isReadOnly} type="submit">
          {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </Button>
      </form>
    </section>
  );
}

function AccessCodesManager({
  match,
  isReadOnly,
}: {
  readonly match: AdminMatch;
  readonly isReadOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [generatedCodes, setGeneratedCodes] = useState<readonly GeneratedAccessCode[]>([]);

  const regenerateMutation = useMutation({
    mutationFn: (role: MatchAccessRole | 'ALL') =>
      role === 'ALL'
        ? adminManagementApi.regenerateAllMatchCodes(match.id)
        : adminManagementApi.regenerateMatchCode(match.id, role),
    onSuccess: (response) => {
      setGeneratedCodes(response.accessCodes);
      notifyMutationSuccess('Tạo lại mã truy cập thành công.');
      void queryClient.invalidateQueries({ queryKey: matchQueryKeys.detail(match.id) });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tạo lại mã truy cập.');
    },
  });

  function regenerate(role: MatchAccessRole | 'ALL') {
    const label = role === 'ALL' ? 'toàn bộ bốn mã' : `mã ${accessCodeRoleLabels[role]}`;
    if (
      window.confirm(`Tạo lại ${label}? Mọi phiên đang dùng mã cũ tương ứng sẽ bị vô hiệu hóa.`)
    ) {
      regenerateMutation.reset();
      setGeneratedCodes([]);
      regenerateMutation.mutate(role);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Mã truy cập trận</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Hệ thống chỉ lưu mã đã băm. Tạo lại mã sẽ đăng xuất các phiên đang dùng thông tin cũ.
          </p>
        </div>
        <Button
          disabled={regenerateMutation.isPending || isReadOnly}
          onClick={() => {
            regenerate('ALL');
          }}
          type="button"
          variant="destructive"
        >
          {regenerateMutation.isPending && regenerateMutation.variables === 'ALL'
            ? 'Đang tạo lại…'
            : 'Tạo lại cả 4 mã'}
        </Button>
      </div>

      {generatedCodes.length > 0 ? (
        <div className="mt-6">
          <GeneratedAccessCodesPanel
            accessCodes={generatedCodes}
            matchPublicId={match.publicId}
            onDismiss={() => {
              setGeneratedCodes([]);
            }}
          />
        </div>
      ) : null}
      {regenerateMutation.isError ? (
        <p
          className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {getApiErrorMessage(regenerateMutation.error, 'Không thể tạo lại mã truy cập.')}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {accessCodeRoles.map((role) => {
          const metadata = match.accessCodes.find((accessCode) => accessCode.role === role);
          return (
            <li className="rounded-xl border border-border p-4" key={role}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{accessCodeRoleLabels[role]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metadata ? `Cập nhật ${formatDateTime(metadata.updatedAt)}` : 'Chưa có mã'}
                  </p>
                </div>
                <Button
                  disabled={regenerateMutation.isPending || isReadOnly}
                  onClick={() => {
                    regenerate(role);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {regenerateMutation.isPending && regenerateMutation.variables === role
                    ? 'Đang tạo…'
                    : 'Tạo lại'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminMatchDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();
  if (!matchId) {
    return <p className="mx-auto w-full max-w-4xl text-sm text-destructive">Thiếu mã trận đấu.</p>;
  }

  return <MatchDetailContent matchId={matchId} />;
}

function MatchDetailContent({ matchId }: { readonly matchId: string }) {
  const { isReadOnly } = useAdminAccessContext();
  const matchQuery = useQuery(matchQueryOptions(matchId));

  if (matchQuery.isPending) {
    return (
      <p className="mx-auto w-full max-w-6xl text-sm text-muted-foreground">Đang tải trận đấu…</p>
    );
  }

  if (matchQuery.isError) {
    return (
      <section
        className="mx-auto w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700"
        role="alert"
      >
        <h1 className="text-xl font-black">Không thể mở trận đấu</h1>
        <p className="mt-2 text-sm">
          {getApiErrorMessage(
            matchQuery.error,
            'Trận đấu không tồn tại hoặc máy chủ không phản hồi.',
          )}
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void matchQuery.refetch()} size="sm" type="button">
            Thử lại
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/tournaments">Về danh sách giải</Link>
          </Button>
        </div>
      </section>
    );
  }

  const match = matchQuery.data.match;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header>
        <Link
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          to={`/admin/tournaments/${match.tournamentId}`}
        >
          ← Về giải đấu
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-4xl font-black tracking-[0.18em] md:text-5xl">
            {match.publicId}
          </h1>
          <ClipboardCopyButton
            accessibleLabel="Sao chép mã trận đấu"
            label="Sao chép ID"
            value={match.publicId}
          />
          <span className="rounded-full border border-primary/10 bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
            {matchStatusLabels[match.status]}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Match ID công khai · Tạo {formatDateTime(match.createdAt)}
        </p>
        <p className="mt-1 text-sm font-semibold">
          {match.weightClass?.name ?? 'Hạng cân chưa xác định'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {match.athletes.map((athlete) => (
            <span className="rounded-lg border px-3 py-2" key={athlete.id}>
              {athlete.color === AthleteColor.RED ? 'Đỏ (RED)' : 'Xanh (BLUE)'}:{' '}
              <b>{athlete.name}</b> · {athlete.organization ?? 'Không đơn vị'}
            </span>
          ))}
        </div>
      </header>

      <MatchEditor isReadOnly={isReadOnly} key={match.updatedAt} match={match} />
      <AdminMatchMonitoring matchId={match.id} />
      <AccessCodesManager isReadOnly={isReadOnly} match={match} />
    </div>
  );
}
