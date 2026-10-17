import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, XCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { ClipboardCopyButton } from '@/components/ui/clipboard-copy-button';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { AdminMatchMonitoring } from '@/features/admin-management/admin-match-monitoring';
import { shouldMonitorLiveMatch } from '@/features/admin-management/admin-match-monitoring-visibility';
import { Button } from '@/components/ui/button';
import {
  formatDateTime,
  getApiErrorMessage,
  inputClassName,
  selectClassName,
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
  type MatchAthleteInput,
  type UpdateMatchInput,
} from '@/services/api/admin-management';
import { AthleteColor } from '@/types/shared';
import { MatchPhase } from '@/types/shared';
import {
  matchVariantClassName,
  presentLifecycle,
  presentPhase,
} from '@/features/match-presentation';
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
  const eligibleAthletes = useMemo(
    () => athletesQuery.data?.items ?? [],
    [athletesQuery.data?.items],
  );
  const selectedWeightClass = activeWeightClasses.find(({ id }) => id === weightClassId);
  const isLegacy =
    match.weightClassId === null || match.athletes.some(({ athleteId }) => athleteId === null);
  const canReplace = match.phase === MatchPhase.WAITING && !isLegacy;
  useEffect(() => {
    const ids = new Set(eligibleAthletes.map(({ id }) => id));
    if (redAthleteId && !ids.has(redAthleteId)) setRedAthleteId(null);
    if (blueAthleteId && !ids.has(blueAthleteId)) setBlueAthleteId(null);
  }, [eligibleAthletes, redAthleteId, blueAthleteId]);
  useEffect(() => {
    if (redAthleteId && redAthleteId === blueAthleteId) setBlueAthleteId(null);
  }, [blueAthleteId, redAthleteId]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-black tracking-tight">Cấu hình trận đấu</h2>
      <form className="mt-5 space-y-6" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold">Trạng thái</p>
            <div className="mt-2 flex h-11 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-bold">
              {presentPhase(match.phase).label}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Trạng thái được điều khiển bởi giám sát viên trong trận đấu.
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
                className={selectClassName}
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
                  excludedAthleteId={blueAthleteId}
                  label="Góc Đỏ (RED)"
                  loading={athletesQuery.isPending}
                  onChange={(id) => {
                    setRedAthleteId(id || null);
                  }}
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
                  onChange={(id) => {
                    setBlueAthleteId(id || null);
                  }}
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
          <Alert role="alert" tone="error">
            {getApiErrorMessage(updateMutation.error, 'Không thể cập nhật trận đấu.')}
          </Alert>
        ) : null}
        {updateMutation.isSuccess ? (
          <Alert role="status" tone="success">
            Đã lưu thông tin trận đấu.
          </Alert>
        ) : null}

        <div className="flex justify-end border-t border-border pt-5">
          <Button disabled={updateMutation.isPending || isReadOnly} type="submit">
            <Save aria-hidden="true" className="size-4" />
            {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </form>
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
        className="mx-auto w-full max-w-xl rounded-2xl border border-destructive/25 bg-card p-6 shadow-sm"
        role="alert"
      >
        <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
          <XCircle aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-black">Không thể mở trận đấu</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {getApiErrorMessage(
            matchQuery.error,
            'Trận đấu không tồn tại hoặc máy chủ không phản hồi.',
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
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
      <div className="space-y-5">
        <PageHeader
          actions={
            <ClipboardCopyButton
              accessibleLabel="Sao chép mã trận đấu"
              label="Sao chép ID"
              value={match.publicId}
            />
          }
          backLabel="Về giải đấu"
          backTo={`/admin/tournaments/${match.tournamentId}/matches`}
          badge={
            <span className="flex flex-wrap gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold leading-5 ${matchVariantClassName[presentLifecycle(match.lifecycle).variant]}`}
              >
                {presentLifecycle(match.lifecycle).label}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold leading-5 ${matchVariantClassName[presentPhase(match.phase).variant]}`}
              >
                {presentPhase(match.phase).label}
              </span>
            </span>
          }
          description={
            <p>
              <span className="font-semibold text-foreground/80">
                {match.weightClass?.name ?? 'Hạng cân chưa xác định'}
              </span>{' '}
              · Match ID công khai · Tạo {formatDateTime(match.createdAt)}
            </p>
          }
          title={<span className="font-mono tracking-[0.14em]">{match.publicId}</span>}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {match.athletes.map((athlete) => (
            <div
              className={cn(
                'rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm',
                athlete.color === AthleteColor.RED ? 'border-l-red-600' : 'border-l-blue-600',
              )}
              key={athlete.id}
            >
              <p
                className={cn(
                  'text-xs font-black uppercase tracking-wider',
                  athlete.color === AthleteColor.RED ? 'text-red-700' : 'text-blue-700',
                )}
              >
                {athlete.color === AthleteColor.RED ? 'Đỏ (RED)' : 'Xanh (BLUE)'}
              </p>
              <p className="mt-1 text-lg font-bold">{athlete.name}</p>
              <p className="text-sm text-muted-foreground">
                {athlete.organization ?? 'Không đơn vị'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <MatchEditor isReadOnly={isReadOnly} key={match.updatedAt} match={match} />
      <AdminMatchMonitoring live={shouldMonitorLiveMatch(match)} matchId={match.id} />
    </div>
  );
}
