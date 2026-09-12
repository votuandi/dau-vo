import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';
import { GeneratedAccessCodesPanel } from '@/components/generated-access-codes-panel';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { TournamentImage, TournamentImagePicker } from '@/components/tournament-image';
import {
  athleteColorLabels,
  formatDate,
  getApiErrorMessage,
  inputClassName,
  matchStatusLabels,
  notifyMutationError,
  notifyMutationSuccess,
  textAreaClassName,
  toDateInputValue,
  tournamentStatusLabels,
  tournamentStatuses,
} from '@/features/admin-management/presentation';
import {
  matchQueryKeys,
  tournamentMatchesQueryOptions,
  activeSportsQueryOptions,
  tournamentQueryKeys,
  tournamentQueryOptions,
} from '@/features/admin-management/queries';
import {
  adminManagementApi,
  type AdminMatch,
  type AdminTournament,
  type GeneratedAccessCode,
  type MatchAthleteInput,
  type UpdateTournamentInput,
} from '@/services/api/admin-management';
import { AthleteColor, TournamentStatus } from '@/types/shared';
import { useAdminAccessContext } from '@/features/auth/admin-access';
import {
  AthletesPage,
  RosterItemsPage,
  TournamentTabs,
} from '@/features/tournament-roster/tournament-roster-tabs';
import { RosterAthleteSelector } from '@/features/admin-management/roster-athlete-selector';
import {
  tournamentAthletesQueryOptions,
  tournamentWeightClassesQueryOptions,
} from '@/features/admin-management/queries';

function TournamentEditor({
  tournament,
  isReadOnly,
}: {
  readonly tournament: AdminTournament;
  readonly isReadOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tournament.name);
  const [description, setDescription] = useState(tournament.description ?? '');
  const [location, setLocation] = useState(tournament.location ?? '');
  const [startDate, setStartDate] = useState(toDateInputValue(tournament.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(tournament.endDate));
  const [status, setStatus] = useState(tournament.status);
  const [sportId, setSportId] = useState(tournament.sportId);
  const sportsQuery = useQuery(activeSportsQueryOptions);
  const matchesQuery = useQuery(tournamentMatchesQueryOptions(tournament.id));
  const [validationError, setValidationError] = useState<string | null>(null);

  const imageMutation = useMutation({
    mutationFn: (file: File) => adminManagementApi.replaceTournamentImage(tournament.id, file),
    onSuccess: ({ imagePath }) => {
      queryClient.setQueryData(tournamentQueryKeys.detail(tournament.id), {
        tournament: { ...tournament, imagePath },
      });
      notifyMutationSuccess('Đã cập nhật logo giải đấu.');
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.all });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tải logo lên.');
    },
  });
  const removeImageMutation = useMutation({
    mutationFn: () => adminManagementApi.removeTournamentImage(tournament.id),
    onSuccess: () => {
      queryClient.setQueryData(tournamentQueryKeys.detail(tournament.id), {
        tournament: { ...tournament, imagePath: null },
      });
      notifyMutationSuccess('Đã gỡ logo giải đấu.');
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.all });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể gỡ logo.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateTournamentInput) =>
      adminManagementApi.updateTournament(tournament.id, input),
    onSuccess: (response) => {
      queryClient.setQueryData(tournamentQueryKeys.detail(tournament.id), response);
      notifyMutationSuccess('Đã lưu thay đổi giải đấu.');
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.all });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể lưu thay đổi giải đấu.');
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMutation.reset();

    if (!name.trim()) {
      setValidationError('Vui lòng nhập tên giải đấu.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setValidationError('Ngày kết thúc không thể trước ngày bắt đầu.');
      return;
    }

    setValidationError(null);
    updateMutation.mutate({
      ...(sportId !== tournament.sportId ? { sportId } : {}),
      name: name.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      status,
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-black tracking-tight">Thông tin giải đấu</h2>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" noValidate onSubmit={handleSubmit}>
        <div className="sm:col-span-2">
          <TournamentImagePicker
            disabled={isReadOnly || updateMutation.isPending}
            imagePath={tournament.imagePath}
            name={name}
            onRemove={() => {
              removeImageMutation.mutate();
            }}
            onUpload={(file) => {
              imageMutation.mutate(file);
            }}
            pending={imageMutation.isPending || removeImageMutation.isPending}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold" htmlFor="tournament-sport">
            Môn thể thao
          </label>
          <select
            className={inputClassName}
            disabled={
              updateMutation.isPending || isReadOnly || matchesQuery.data?.matches.length !== 0
            }
            id="tournament-sport"
            onChange={(event) => {
              setSportId(event.target.value);
            }}
            value={sportId}
          >
            <option value={tournament.sport.id}>
              {tournament.sport.name} — {tournament.sport.sportGroup.name}
              {tournament.sport.isActive ? '' : ' (ngừng hoạt động)'}
            </option>
            {sportsQuery.data
              ?.filter((sport) => sport.id !== tournament.sport.id)
              .map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name} — {sport.sportGroup.name}
                </option>
              ))}
          </select>
          {matchesQuery.isSuccess && matchesQuery.data.matches.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Không thể đổi môn thể thao sau khi đã tạo trận đấu.
            </p>
          ) : null}
          {matchesQuery.isError ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Việc đổi môn thể thao sẽ được máy chủ kiểm tra khi lưu.
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold" htmlFor="tournament-name">
            Tên giải đấu
          </label>
          <input
            className={inputClassName}
            disabled={updateMutation.isPending || isReadOnly}
            id="tournament-name"
            maxLength={255}
            onChange={(event) => {
              setName(event.target.value);
            }}
            value={name}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold" htmlFor="tournament-description">
            Mô tả
          </label>
          <textarea
            className={textAreaClassName}
            disabled={updateMutation.isPending || isReadOnly}
            id="tournament-description"
            maxLength={5000}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            value={description}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold" htmlFor="tournament-location">
            Địa điểm
          </label>
          <input
            className={inputClassName}
            disabled={updateMutation.isPending || isReadOnly}
            id="tournament-location"
            maxLength={255}
            onChange={(event) => {
              setLocation(event.target.value);
            }}
            value={location}
          />
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="tournament-start-date">
            Ngày bắt đầu
          </label>
          <DateInput
            className={inputClassName}
            disabled={updateMutation.isPending || isReadOnly}
            id="tournament-start-date"
            onChange={setStartDate}
            value={startDate}
          />
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="tournament-end-date">
            Ngày kết thúc
          </label>
          <DateInput
            className={inputClassName}
            disabled={updateMutation.isPending || isReadOnly}
            id="tournament-end-date"
            onChange={setEndDate}
            value={endDate}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold" htmlFor="tournament-status">
            Trạng thái
          </label>
          <select
            className={inputClassName}
            disabled={updateMutation.isPending || isReadOnly}
            id="tournament-status"
            onChange={(event) => {
              setStatus(event.target.value as TournamentStatus);
            }}
            value={status}
          >
            {tournamentStatuses.map((item) => (
              <option key={item} value={item}>
                {tournamentStatusLabels[item]}
              </option>
            ))}
          </select>
        </div>

        {validationError ? (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {validationError}
          </p>
        ) : null}
        {updateMutation.isError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:col-span-2"
            role="alert"
          >
            {getApiErrorMessage(updateMutation.error, 'Không thể cập nhật giải đấu.')}
          </p>
        ) : null}
        {updateMutation.isSuccess ? (
          <p className="text-sm font-semibold text-emerald-700 sm:col-span-2" role="status">
            Đã lưu thông tin giải đấu.
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <Button disabled={updateMutation.isPending || isReadOnly} type="submit">
            {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function MatchCard({ match }: { readonly match: AdminMatch }) {
  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="font-mono text-xl font-black tracking-wider hover:underline"
              to={`/admin/matches/${match.id}`}
            >
              {match.publicId}
            </Link>
            <span className="rounded-full border border-primary/10 bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
              {matchStatusLabels[match.status]}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold">
              {match.weightClass?.name ?? 'Hạng cân chưa xác định'}
            </span>
            {match.athletes.map((athlete) => (
              <span key={athlete.id}>
                <span
                  className={
                    athlete.color === AthleteColor.RED
                      ? 'font-bold text-red-700'
                      : 'font-bold text-blue-700'
                  }
                >
                  {athleteColorLabels[athlete.color]}:
                </span>{' '}
                {athlete.name}
              </span>
            ))}
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/matches/${match.id}`}>Quản lý trận</Link>
        </Button>
      </div>
    </li>
  );
}

function TournamentMatches({
  tournament,
  isReadOnly,
}: {
  readonly tournament: AdminTournament;
  readonly isReadOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const matchesQuery = useQuery(tournamentMatchesQueryOptions(tournament.id));
  const weightClassesQuery = useQuery(tournamentWeightClassesQueryOptions(tournament.id));
  const [weightClassId, setWeightClassId] = useState('');
  const athletesQuery = useQuery({
    ...tournamentAthletesQueryOptions(tournament.id, {
      isActive: true,
      page: 1,
      pageSize: 100,
      ...(weightClassId ? { weightClassId } : {}),
    }),
    enabled: Boolean(weightClassId),
  });
  const [redAthleteId, setRedAthleteId] = useState<string | null>(null);
  const [blueAthleteId, setBlueAthleteId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<readonly GeneratedAccessCode[]>([]);
  const [newMatch, setNewMatch] = useState<AdminMatch | null>(null);

  const createMutation = useMutation({
    mutationFn: (athletes: readonly [MatchAthleteInput, MatchAthleteInput]) =>
      adminManagementApi.createMatch(tournament.id, { athletes }),
    onSuccess: (response) => {
      setGeneratedCodes(response.accessCodes);
      setNewMatch(response.match);
      setRedAthleteId(null);
      setBlueAthleteId(null);
      queryClient.setQueryData(matchQueryKeys.detail(response.match.id), { match: response.match });
      notifyMutationSuccess('Tạo trận đấu thành công.');
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tạo trận đấu.');
      void queryClient.invalidateQueries({
        queryKey: tournamentQueryKeys.athletes(tournament.id, {}),
      });
    },
  });

  function handleCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.reset();
    if (!redAthleteId || !blueAthleteId) {
      setValidationError('Chọn một vận động viên cho mỗi góc.');
      return;
    }

    setValidationError(null);
    createMutation.mutate([
      { color: AthleteColor.RED, athleteId: redAthleteId },
      { color: AthleteColor.BLUE, athleteId: blueAthleteId },
    ]);
  }

  const activeWeightClasses = useMemo(
    () => weightClassesQuery.data?.weightClasses.filter(({ isActive }) => isActive) ?? [],
    [weightClassesQuery.data?.weightClasses],
  );
  const eligibleAthletes = useMemo(
    () => athletesQuery.data?.items ?? [],
    [athletesQuery.data?.items],
  );
  const selectedWeightClass = activeWeightClasses.find(({ id }) => id === weightClassId);
  useEffect(() => {
    if (!weightClassId && activeWeightClasses.length > 0)
      setWeightClassId(activeWeightClasses[0]?.id ?? '');
  }, [activeWeightClasses, weightClassId]);
  useEffect(() => {
    const ids = new Set(eligibleAthletes.map(({ id }) => id));
    if (redAthleteId && !ids.has(redAthleteId)) setRedAthleteId(null);
    if (blueAthleteId && !ids.has(blueAthleteId)) setBlueAthleteId(null);
  }, [eligibleAthletes, redAthleteId, blueAthleteId]);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight">Các trận đấu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mỗi trận được tạo cùng đúng hai vận động viên và bốn mã truy cập.
          </p>
        </div>
        {matchesQuery.isSuccess ? (
          <span className="text-sm font-semibold text-muted-foreground">
            {matchesQuery.data.matches.length} trận
          </span>
        ) : null}
      </div>

      {generatedCodes.length > 0 && newMatch ? (
        <div className="mt-6">
          <GeneratedAccessCodesPanel
            accessCodes={generatedCodes}
            matchPublicId={newMatch.publicId}
            onDismiss={() => {
              setGeneratedCodes([]);
            }}
            title={`Mã truy cập trận ${newMatch.publicId}`}
          />
          <Button asChild className="mt-3" size="sm" variant="outline">
            <Link to={`/admin/matches/${newMatch.id}`}>Mở trận {newMatch.publicId}</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          {matchesQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Đang tải danh sách trận…</p>
          ) : null}
          {matchesQuery.isError ? (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              role="alert"
            >
              <p>{getApiErrorMessage(matchesQuery.error, 'Không thể tải danh sách trận.')}</p>
              <Button
                className="mt-3"
                onClick={() => void matchesQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Thử lại
              </Button>
            </div>
          ) : null}
          {matchesQuery.isSuccess && matchesQuery.data.matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Chưa có trận đấu nào.
            </div>
          ) : null}
          {matchesQuery.isSuccess && matchesQuery.data.matches.length > 0 ? (
            <ul className="space-y-3">
              {matchesQuery.data.matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </ul>
          ) : null}
        </div>

        <form className="rounded-xl bg-muted/60 p-4" noValidate onSubmit={handleCreate}>
          <h3 className="font-black">Tạo trận mới</h3>
          <fieldset className="mt-4 space-y-4" disabled={createMutation.isPending || isReadOnly}>
            <legend className="sr-only">Hai vận động viên</legend>
            <label className="block text-sm font-semibold" htmlFor="match-weight-class">
              Hạng cân
            </label>
            <select
              className={inputClassName}
              id="match-weight-class"
              onChange={(event) => {
                setWeightClassId(event.target.value);
                setRedAthleteId(null);
                setBlueAthleteId(null);
              }}
              value={weightClassId}
            >
              <option value="">Chọn hạng cân</option>
              {activeWeightClasses.map((weightClass) => (
                <option key={weightClass.id} value={weightClass.id}>
                  {weightClass.name}
                </option>
              ))}
            </select>
            {activeWeightClasses.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm">
                Chưa có hạng cân hoạt động.{' '}
                <Link
                  className="font-bold underline"
                  to={`/admin/tournaments/${tournament.id}/weight-classes`}
                >
                  Quản lý hạng cân
                </Link>
              </p>
            ) : null}
            {weightClassId && !athletesQuery.isPending && eligibleAthletes.length < 2 ? (
              <p className="rounded-lg border border-dashed p-3 text-sm">
                Hạng cân này cần ít nhất hai vận động viên đang hoạt động.{' '}
                <Link
                  className="font-bold underline"
                  to={`/admin/tournaments/${tournament.id}/athletes`}
                >
                  Quản lý vận động viên
                </Link>
              </p>
            ) : null}
            <RosterAthleteSelector
              athletes={eligibleAthletes}
              color={AthleteColor.RED}
              disabled={eligibleAthletes.length < 2}
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
          </fieldset>

          {validationError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {validationError}
            </p>
          ) : null}
          {createMutation.isError ? (
            <p
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {getApiErrorMessage(createMutation.error, 'Không thể tạo trận đấu.')}
            </p>
          ) : null}
          <Button
            className="mt-4 w-full"
            disabled={
              createMutation.isPending ||
              tournament.status === TournamentStatus.ARCHIVED ||
              isReadOnly ||
              !redAthleteId ||
              !blueAthleteId ||
              eligibleAthletes.length < 2
            }
            type="submit"
          >
            {createMutation.isPending
              ? 'Đang tạo trận…'
              : tournament.status === TournamentStatus.ARCHIVED
                ? 'Giải đã lưu trữ'
                : 'Tạo trận và mã truy cập'}
          </Button>
        </form>
      </div>
    </section>
  );
}

export function AdminTournamentDetailPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();

  if (!tournamentId) {
    return <p className="mx-auto w-full max-w-4xl text-sm text-destructive">Thiếu mã giải đấu.</p>;
  }

  return <TournamentDetailContent tournamentId={tournamentId} />;
}

function TournamentDetailContent({ tournamentId }: { readonly tournamentId: string }) {
  const { isReadOnly } = useAdminAccessContext();
  const location = useLocation();
  const tournamentQuery = useQuery(tournamentQueryOptions(tournamentId));

  if (tournamentQuery.isPending) {
    return (
      <p className="mx-auto w-full max-w-6xl text-sm text-muted-foreground">Đang tải giải đấu…</p>
    );
  }

  if (tournamentQuery.isError) {
    return (
      <section
        className="mx-auto w-full max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700"
        role="alert"
      >
        <h1 className="text-xl font-black">Không thể mở giải đấu</h1>
        <p className="mt-2 text-sm">
          {getApiErrorMessage(
            tournamentQuery.error,
            'Giải đấu không tồn tại hoặc máy chủ không phản hồi.',
          )}
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void tournamentQuery.refetch()} size="sm" type="button">
            Thử lại
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/tournaments">Về danh sách</Link>
          </Button>
        </div>
      </section>
    );
  }

  const tournament = tournamentQuery.data.tournament;
  const tail = location.pathname.split('/').at(-1);
  const active =
    tail === tournamentId
      ? 'info'
      : tail === 'weight-classes' ||
          tail === 'organizations' ||
          tail === 'athletes' ||
          tail === 'matches'
        ? tail
        : 'info';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header>
        <Link
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          to="/admin/tournaments"
        >
          ← Tất cả giải đấu
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TournamentImage
            className="size-16"
            imagePath={tournament.imagePath}
            name={tournament.name}
          />
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{tournament.name}</h1>
          <span className="rounded-full border border-primary/10 bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
            {tournamentStatusLabels[tournament.status]}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {tournament.sport.name} · {tournament.sport.sportGroup.name} ·{' '}
          {tournament.location ?? 'Chưa có địa điểm'} · {formatDate(tournament.startDate)} –{' '}
          {formatDate(tournament.endDate)}
        </p>
      </header>

      <TournamentTabs active={active} tournamentId={tournamentId} />
      {active === 'info' ? (
        <TournamentEditor
          isReadOnly={isReadOnly}
          key={tournament.updatedAt}
          tournament={tournament}
        />
      ) : null}
      {active === 'matches' ? (
        <TournamentMatches isReadOnly={isReadOnly} tournament={tournament} />
      ) : null}
      {active === 'weight-classes' ? (
        <RosterItemsPage
          kind="weight-classes"
          readOnly={isReadOnly || tournament.status === TournamentStatus.ARCHIVED}
          tournamentId={tournamentId}
        />
      ) : null}
      {active === 'organizations' ? (
        <RosterItemsPage
          kind="organizations"
          readOnly={isReadOnly || tournament.status === TournamentStatus.ARCHIVED}
          tournamentId={tournamentId}
        />
      ) : null}
      {active === 'athletes' ? (
        <AthletesPage
          readOnly={isReadOnly || tournament.status === TournamentStatus.ARCHIVED}
          tournamentId={tournamentId}
        />
      ) : null}
    </div>
  );
}
