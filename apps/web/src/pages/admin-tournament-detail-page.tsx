import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, KeyRound, MapPin, Save, XCircle } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { TournamentStatusBadge } from '@/features/admin-management/tournament-status-badge';
import { ClipboardCopyButton } from '@/components/ui/clipboard-copy-button';
import { toast } from '@/components/ui/toast';
import { DateInput } from '@/components/ui/date-input';
import { TournamentImage, TournamentImagePicker } from '@/components/tournament-image';
import {
  formatDate,
  getApiErrorMessage,
  inputClassName,
  selectClassName,
  notifyMutationError,
  notifyMutationSuccess,
  textAreaClassName,
  toDateInputValue,
  tournamentStatusLabels,
  tournamentStatuses,
} from '@/features/admin-management/presentation';
import {
  tournamentMatchesQueryOptions,
  activeSportsQueryOptions,
  tournamentQueryKeys,
  tournamentQueryOptions,
} from '@/features/admin-management/queries';
import {
  adminManagementApi,
  type AdminTournament,
  type UpdateTournamentInput,
} from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import { useAdminAccessContext } from '@/features/auth/admin-access';
import {
  AthletesPage,
  RosterItemsPage,
  TournamentTabs,
} from '@/features/tournament-roster/tournament-roster-tabs';
import { TournamentMatchesPage } from '@/features/tournament-bracket/tournament-matches-page';
import { TournamentOfficialsPage } from '@/features/tournament-officials/tournament-officials-page';
import { TournamentOfficialRole } from '@/types/shared';

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
            className={selectClassName}
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
            className={selectClassName}
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
          <Alert className="sm:col-span-2" role="alert" tone="error">
            {getApiErrorMessage(updateMutation.error, 'Không thể cập nhật giải đấu.')}
          </Alert>
        ) : null}
        {updateMutation.isSuccess ? (
          <Alert className="sm:col-span-2" role="status" tone="success">
            Đã lưu thông tin giải đấu.
          </Alert>
        ) : null}

        <div className="flex justify-end border-t border-border pt-5 sm:col-span-2">
          <Button disabled={updateMutation.isPending || isReadOnly} type="submit">
            <Save aria-hidden="true" className="size-4" />
            {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </form>
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
        className="mx-auto w-full max-w-xl rounded-2xl border border-destructive/25 bg-card p-6 shadow-sm"
        role="alert"
      >
        <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
          <XCircle aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-black">Không thể mở giải đấu</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {getApiErrorMessage(
            tournamentQuery.error,
            'Giải đấu không tồn tại hoặc máy chủ không phản hồi.',
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
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
          tail === 'matches' ||
          tail === 'judges' ||
          tail === 'supervisors'
        ? tail
        : 'info';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div className="space-y-5">
        <PageHeader
          backLabel="Tất cả giải đấu"
          backTo="/admin/tournaments"
          badge={<TournamentStatusBadge status={tournament.status} />}
          description={
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-semibold text-foreground/80">
                {tournament.sport.name} · {tournament.sport.sportGroup.name}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="size-3.5" />
                {tournament.location ?? 'Chưa có địa điểm'}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays aria-hidden="true" className="size-3.5" />
                {formatDate(tournament.startDate)} – {formatDate(tournament.endDate)}
              </span>
            </p>
          }
          media={
            <TournamentImage
              className="size-16 shrink-0"
              imagePath={tournament.imagePath}
              name={tournament.name}
            />
          }
          title={tournament.name}
        />
        {tournament.status === TournamentStatus.ARCHIVED ? (
          <Alert title="Giải đấu đã lưu trữ" tone="warning">
            <p>
              Danh sách hạng cân, đơn vị, vận động viên và trọng tài chỉ có thể xem. Đổi trạng thái
              ở tab Thông tin để chỉnh sửa lại.
            </p>
          </Alert>
        ) : null}
        <section className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-white/60 p-4 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <KeyRound aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Mã đăng nhập giải đấu</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <code className="select-all rounded-lg border border-primary/20 bg-white px-3 py-1.5 font-mono text-lg font-black uppercase tracking-[0.12em] text-primary">
                {tournament.publicCode}
              </code>
              <ClipboardCopyButton
                accessibleLabel="Sao chép mã đăng nhập giải đấu"
                label="Sao chép mã"
                onCopyError={() => {
                  toast({
                    title: 'Không thể sao chép mã. Vui lòng sao chép thủ công.',
                    variant: 'destructive',
                  });
                }}
                onCopySuccess={() => {
                  toast({ title: 'Đã sao chép mã giải đấu.', variant: 'success' });
                }}
                value={tournament.publicCode}
              />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Giám định và giám sát sử dụng mã này cùng với mã bảo mật riêng để đăng nhập.
            </p>
          </div>
        </section>
      </div>

      <TournamentTabs active={active} tournamentId={tournamentId} />
      {active === 'info' ? (
        <TournamentEditor
          isReadOnly={isReadOnly}
          key={tournament.updatedAt}
          tournament={tournament}
        />
      ) : null}
      {active === 'matches' ? (
        <TournamentMatchesPage isReadOnly={isReadOnly} tournament={tournament} />
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
      {active === 'judges' ? (
        <TournamentOfficialsPage
          readOnly={isReadOnly || tournament.status === TournamentStatus.ARCHIVED}
          role={TournamentOfficialRole.JUDGE}
          tournamentId={tournamentId}
          tournamentPublicCode={tournament.publicCode}
        />
      ) : null}
      {active === 'supervisors' ? (
        <TournamentOfficialsPage
          readOnly={isReadOnly || tournament.status === TournamentStatus.ARCHIVED}
          role={TournamentOfficialRole.SUPERVISOR}
          tournamentId={tournamentId}
          tournamentPublicCode={tournament.publicCode}
        />
      ) : null}
    </div>
  );
}
