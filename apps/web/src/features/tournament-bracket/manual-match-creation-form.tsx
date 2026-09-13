import { useEffect, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GeneratedAccessCodesPanel } from '@/components/generated-access-codes-panel';
import {
  getApiErrorMessage,
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import { RosterAthleteSelector } from '@/features/admin-management/roster-athlete-selector';
import {
  matchQueryKeys,
  tournamentAthletesQueryOptions,
  tournamentQueryKeys,
} from '@/features/admin-management/queries';
import {
  adminManagementApi,
  type AdminMatch,
  type AdminTournament,
  type GeneratedAccessCode,
} from '@/services/api/admin-management';
import { AthleteColor, TournamentStatus } from '@/types/shared';

export function ManualMatchCreationForm({
  tournament,
  isReadOnly,
  weightClass,
}: {
  readonly tournament: AdminTournament;
  readonly isReadOnly: boolean;
  readonly weightClass: { readonly id: string; readonly name: string } | null;
}) {
  const queryClient = useQueryClient();
  const [redAthleteId, setRedAthleteId] = useState<string | null>(null);
  const [blueAthleteId, setBlueAthleteId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    match: AdminMatch;
    accessCodes: readonly GeneratedAccessCode[];
  } | null>(null);
  const athletesQuery = useQuery({
    ...tournamentAthletesQueryOptions(tournament.id, {
      page: 1,
      pageSize: 100,
      isActive: true,
      ...(weightClass ? { weightClassId: weightClass.id } : {}),
    }),
    enabled: Boolean(weightClass),
  });
  const athletes = athletesQuery.data?.items ?? [];
  useEffect(() => {
    setRedAthleteId(null);
    setBlueAthleteId(null);
    setValidationError(null);
  }, [weightClass?.id]);
  useEffect(() => {
    const ids = new Set(athletes.map((athlete) => athlete.id));
    if (redAthleteId && !ids.has(redAthleteId)) setRedAthleteId(null);
    if (blueAthleteId && !ids.has(blueAthleteId)) setBlueAthleteId(null);
  }, [athletes, blueAthleteId, redAthleteId]);
  const create = useMutation({
    mutationFn: () =>
      adminManagementApi.createMatch(tournament.id, {
        athletes: [
          { color: AthleteColor.RED, athleteId: redAthleteId! },
          { color: AthleteColor.BLUE, athleteId: blueAthleteId! },
        ],
      }),
    onSuccess: (response) => {
      setCreated(response);
      setRedAthleteId(null);
      setBlueAthleteId(null);
      queryClient.setQueryData(matchQueryKeys.detail(response.match.id), { match: response.match });
      notifyMutationSuccess('Tạo trận đấu thành công.');
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) }),
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matchCounts(tournament.id) }),
      ]);
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tạo trận đấu.');
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.athletes(tournament.id, {}),
      });
    },
  });
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    create.reset();
    if (!redAthleteId || !blueAthleteId || redAthleteId === blueAthleteId) {
      setValidationError('Chọn hai vận động viên khác nhau cho mỗi góc.');
      return;
    }
    setValidationError(null);
    create.mutate();
  }
  const disabled =
    create.isPending ||
    isReadOnly ||
    tournament.status === TournamentStatus.ARCHIVED ||
    !weightClass ||
    athletes.length < 2;
  return (
    <form className="rounded-xl bg-muted/60 p-4" noValidate onSubmit={submit}>
      <h3 className="font-black">Tạo trận riêng lẻ</h3>
      <p className="mt-1 text-sm text-muted-foreground">Trận này không được gắn vào nhánh đấu.</p>
      {!weightClass ? (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-sm">
          Chọn một hạng cân để tạo trận.
        </p>
      ) : null}
      {weightClass && !athletesQuery.isPending && athletes.length < 2 ? (
        <p className="mt-4 rounded-lg border border-dashed p-3 text-sm">
          Hạng cân này cần ít nhất hai vận động viên đang hoạt động.{' '}
          <Link className="font-bold underline" to={`/admin/tournaments/${tournament.id}/athletes`}>
            Quản lý vận động viên
          </Link>
        </p>
      ) : null}
      <fieldset className="mt-4 space-y-4" disabled={disabled}>
        <legend className="sr-only">Hai vận động viên</legend>
        <RosterAthleteSelector
          athletes={athletes}
          color={AthleteColor.RED}
          disabled={athletes.length < 2}
          excludedAthleteId={blueAthleteId}
          label="Góc Đỏ (RED)"
          loading={athletesQuery.isPending}
          onChange={(id) => setRedAthleteId(id || null)}
          selectedAthleteId={redAthleteId}
          weightClassName={weightClass?.name}
        />
        <RosterAthleteSelector
          athletes={athletes}
          color={AthleteColor.BLUE}
          disabled={athletes.length < 2}
          excludedAthleteId={redAthleteId}
          label="Góc Xanh (BLUE)"
          loading={athletesQuery.isPending}
          onChange={(id) => setBlueAthleteId(id || null)}
          selectedAthleteId={blueAthleteId}
          weightClassName={weightClass?.name}
        />
      </fieldset>
      {validationError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {validationError}
        </p>
      ) : null}
      {create.isError ? (
        <p
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {getApiErrorMessage(create.error, 'Không thể tạo trận đấu.')}
        </p>
      ) : null}
      <Button
        className="mt-4 w-full"
        disabled={disabled || !redAthleteId || !blueAthleteId}
        type="submit"
      >
        {create.isPending
          ? 'Đang tạo trận…'
          : tournament.status === TournamentStatus.ARCHIVED
            ? 'Giải đã lưu trữ'
            : 'Tạo trận và mã truy cập'}
      </Button>
      {created ? (
        <div className="mt-5">
          <GeneratedAccessCodesPanel
            accessCodes={created.accessCodes}
            matchPublicId={created.match.publicId}
            onDismiss={() => setCreated(null)}
            title={`Mã truy cập trận ${created.match.publicId}`}
          />
          <Link
            className="mt-2 inline-block text-sm font-bold underline"
            to={`/admin/matches/${created.match.id}`}
          >
            Mở trận
          </Link>
        </div>
      ) : null}
    </form>
  );
}
