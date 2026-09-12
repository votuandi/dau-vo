import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { GeneratedAccessCodesPanel } from '@/components/generated-access-codes-panel';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
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

interface AthleteDraft {
  readonly name: string;
  readonly organization: string;
}

function athleteInput(color: AthleteColor, draft: AthleteDraft): MatchAthleteInput {
  return {
    color,
    name: draft.name.trim(),
    organization: draft.organization.trim(),
  };
}

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
  const [validationError, setValidationError] = useState<string | null>(null);

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
  const [redAthlete, setRedAthlete] = useState<AthleteDraft>({ name: '', organization: '' });
  const [blueAthlete, setBlueAthlete] = useState<AthleteDraft>({ name: '', organization: '' });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<readonly GeneratedAccessCode[]>([]);
  const [newMatch, setNewMatch] = useState<AdminMatch | null>(null);

  const createMutation = useMutation({
    mutationFn: (athletes: readonly [MatchAthleteInput, MatchAthleteInput]) =>
      adminManagementApi.createMatch(tournament.id, { athletes }),
    onSuccess: (response) => {
      setGeneratedCodes(response.accessCodes);
      setNewMatch(response.match);
      setRedAthlete({ name: '', organization: '' });
      setBlueAthlete({ name: '', organization: '' });
      queryClient.setQueryData(matchQueryKeys.detail(response.match.id), { match: response.match });
      notifyMutationSuccess('Tạo trận đấu thành công.');
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.matches(tournament.id) });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tạo trận đấu.');
    },
  });

  function handleCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.reset();
    setGeneratedCodes([]);
    setNewMatch(null);

    if (
      !redAthlete.name.trim() ||
      !redAthlete.organization.trim() ||
      !blueAthlete.name.trim() ||
      !blueAthlete.organization.trim()
    ) {
      setValidationError('Nhập đầy đủ tên và đơn vị cho cả vận động viên Đỏ và Xanh.');
      return;
    }

    setValidationError(null);
    createMutation.mutate([
      athleteInput(AthleteColor.RED, redAthlete),
      athleteInput(AthleteColor.BLUE, blueAthlete),
    ]);
  }

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
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
              <p className="text-sm font-bold text-red-800">Vận động viên Đỏ</p>
              <label className="mt-3 block text-xs font-semibold" htmlFor="red-athlete-name">
                Họ tên
              </label>
              <input
                className={inputClassName}
                id="red-athlete-name"
                maxLength={255}
                onChange={(event) => {
                  setRedAthlete((current) => ({ ...current, name: event.target.value }));
                }}
                value={redAthlete.name}
              />
              <label
                className="mt-3 block text-xs font-semibold"
                htmlFor="red-athlete-organization"
              >
                Đơn vị
              </label>
              <input
                className={inputClassName}
                id="red-athlete-organization"
                maxLength={255}
                onChange={(event) => {
                  setRedAthlete((current) => ({ ...current, organization: event.target.value }));
                }}
                value={redAthlete.organization}
              />
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <p className="text-sm font-bold text-blue-800">Vận động viên Xanh</p>
              <label className="mt-3 block text-xs font-semibold" htmlFor="blue-athlete-name">
                Họ tên
              </label>
              <input
                className={inputClassName}
                id="blue-athlete-name"
                maxLength={255}
                onChange={(event) => {
                  setBlueAthlete((current) => ({ ...current, name: event.target.value }));
                }}
                value={blueAthlete.name}
              />
              <label
                className="mt-3 block text-xs font-semibold"
                htmlFor="blue-athlete-organization"
              >
                Đơn vị
              </label>
              <input
                className={inputClassName}
                id="blue-athlete-organization"
                maxLength={255}
                onChange={(event) => {
                  setBlueAthlete((current) => ({ ...current, organization: event.target.value }));
                }}
                value={blueAthlete.organization}
              />
            </div>
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
              isReadOnly
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
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{tournament.name}</h1>
          <span className="rounded-full border border-primary/10 bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
            {tournamentStatusLabels[tournament.status]}
          </span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {tournament.location ?? 'Chưa có địa điểm'} · {formatDate(tournament.startDate)} –{' '}
          {formatDate(tournament.endDate)}
        </p>
      </header>

      <TournamentEditor
        isReadOnly={isReadOnly}
        key={tournament.updatedAt}
        tournament={tournament}
      />
      <TournamentMatches isReadOnly={isReadOnly} tournament={tournament} />
    </div>
  );
}
