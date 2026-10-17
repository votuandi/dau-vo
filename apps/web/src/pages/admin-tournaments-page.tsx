import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ChevronRight,
  MapPin,
  Plus,
  Trophy,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { PageHeader } from '@/components/ui/page-header';
import { TournamentStatusBadge } from '@/features/admin-management/tournament-status-badge';
import { TournamentImage } from '@/components/tournament-image';
import { TournamentImagePicker } from '@/components/tournament-image';
import {
  formatDate,
  getApiErrorMessage,
  inputClassName,
  selectClassName,
  notifyMutationError,
  notifyMutationSuccess,
  textAreaClassName,
  tournamentStatusLabels,
  tournamentStatuses,
} from '@/features/admin-management/presentation';
import {
  activeSportsQueryOptions,
  tournamentQueryKeys,
  tournamentsQueryOptions,
} from '@/features/admin-management/queries';
import { adminManagementApi, type CreateTournamentInput } from '@/services/api/admin-management';
import { TournamentStatus } from '@/types/shared';
import { useAdminAccessContext } from '@/features/auth/admin-access';

interface TournamentFormErrors {
  readonly name?: string;
  readonly sportId?: string;
  readonly dates?: string;
}

function buildCreateTournamentInput(values: {
  readonly name: string;
  readonly description: string;
  readonly location: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly sportId: string;
  readonly status: TournamentStatus;
}): CreateTournamentInput {
  return {
    name: values.name.trim(),
    sportId: values.sportId,
    status: values.status,
    ...(values.description.trim() ? { description: values.description.trim() } : {}),
    ...(values.location.trim() ? { location: values.location.trim() } : {}),
    ...(values.startDate ? { startDate: values.startDate } : {}),
    ...(values.endDate ? { endDate: values.endDate } : {}),
  };
}

export function AdminTournamentsPage() {
  const { isReadOnly } = useAdminAccessContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tournamentsQuery = useQuery(tournamentsQueryOptions);
  const sportsQuery = useQuery(activeSportsQueryOptions);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sportId, setSportId] = useState('');
  const [status, setStatus] = useState<TournamentStatus>(TournamentStatus.DRAFT);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formErrors, setFormErrors] = useState<TournamentFormErrors>({});

  const createMutation = useMutation({
    mutationFn: async (input: CreateTournamentInput) => {
      const created = await adminManagementApi.createTournament(input);
      if (!logoFile) return { ...created, imageUploadFailed: false };
      try {
        await adminManagementApi.replaceTournamentImage(created.tournament.id, logoFile);
        return { ...created, imageUploadFailed: false };
      } catch {
        return { ...created, imageUploadFailed: true };
      }
    },
    onSuccess: ({ tournament, imageUploadFailed }) => {
      notifyMutationSuccess('Tạo giải đấu thành công.');
      if (imageUploadFailed)
        notifyMutationError(
          new Error(),
          'Giải đấu đã được tạo, nhưng tải logo thất bại. Bạn có thể thử lại ở trang chi tiết.',
        );
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.all });
      void navigate(`/admin/tournaments/${tournament.id}`);
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tạo giải đấu.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: adminManagementApi.archiveTournament,
    onSuccess: ({ tournament }) => {
      queryClient.setQueryData(tournamentQueryKeys.detail(tournament.id), { tournament });
      notifyMutationSuccess('Lưu trữ giải đấu thành công.');
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.all });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể lưu trữ giải đấu.');
    },
  });

  function handleCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.reset();

    const errors: { name?: string; dates?: string; sportId?: string } = {};
    if (!name.trim()) {
      errors.name = 'Vui lòng nhập tên giải đấu.';
    }
    if (startDate && endDate && endDate < startDate) {
      errors.dates = 'Ngày kết thúc không thể trước ngày bắt đầu.';
    }
    if (!sportId) {
      errors.sportId = 'Vui lòng chọn môn thể thao.';
    }
    setFormErrors(errors);

    if (errors.name || errors.dates || errors.sportId || !sportsQuery.data?.length) {
      return;
    }

    createMutation.mutate(
      buildCreateTournamentInput({
        name,
        description,
        location,
        startDate,
        endDate,
        sportId,
        status,
      }),
    );
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { readonly id: string; readonly status: TournamentStatus }) =>
      adminManagementApi.updateTournament(id, { status }),
    onSuccess: ({ tournament }, { status }) => {
      queryClient.setQueryData(tournamentQueryKeys.detail(tournament.id), { tournament });
      notifyMutationSuccess(
        status === TournamentStatus.DRAFT
          ? 'Đã khôi phục giải đấu.'
          : 'Đã cập nhật trạng thái giải đấu.',
      );
      void queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.all });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật trạng thái giải đấu.');
    },
  });

  function archiveTournament(id: string) {
    archiveMutation.mutate(id);
  }

  function changeTournamentStatus(id: string, nextStatus: TournamentStatus) {
    if (nextStatus === TournamentStatus.ARCHIVED) {
      archiveTournament(id);
      return;
    }
    statusMutation.mutate({ id, status: nextStatus });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        backLabel="Bảng điều khiển"
        backTo="/admin"
        description="Tạo giải đấu, cập nhật lịch và quản lý các trận thuộc từng giải."
        title="Giải đấu"
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-black tracking-tight">Danh sách giải đấu</h2>
            {tournamentsQuery.isSuccess ? (
              <Badge tone="primary">{tournamentsQuery.data.tournaments.length} giải</Badge>
            ) : null}
          </div>

          {tournamentsQuery.isPending ? (
            <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
              Đang tải giải đấu…
            </p>
          ) : null}

          {tournamentsQuery.isError ? (
            <Alert className="mt-6" role="alert" tone="error">
              <p>
                {getApiErrorMessage(tournamentsQuery.error, 'Không thể tải danh sách giải đấu.')}
              </p>
              <Button
                className="mt-3"
                onClick={() => void tournamentsQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Thử lại
              </Button>
            </Alert>
          ) : null}

          {tournamentsQuery.isSuccess && tournamentsQuery.data.tournaments.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Trophy aria-hidden="true" className="size-6" />
              </span>
              <p className="mt-3 font-semibold">Chưa có giải đấu</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Dùng biểu mẫu bên cạnh để tạo giải đầu tiên.
              </p>
            </div>
          ) : null}

          {tournamentsQuery.isSuccess && tournamentsQuery.data.tournaments.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {tournamentsQuery.data.tournaments.map((tournament) => {
                const isArchiving =
                  archiveMutation.isPending && archiveMutation.variables === tournament.id;
                const isChangingStatus =
                  statusMutation.isPending && statusMutation.variables.id === tournament.id;
                const isUpdating = isArchiving || isChangingStatus;
                const isArchived = tournament.status === TournamentStatus.ARCHIVED;
                return (
                  <li
                    className="rounded-xl border border-border bg-white/60 p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-md"
                    key={tournament.id}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <TournamentImage
                        className="size-14 shrink-0"
                        imagePath={tournament.imagePath}
                        name={tournament.name}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="min-w-0 break-words text-lg font-bold hover:text-primary hover:underline"
                            to={`/admin/tournaments/${tournament.id}`}
                          >
                            {tournament.name}
                          </Link>
                          <TournamentStatusBadge status={tournament.status} />
                        </div>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground/80">
                            {tournament.sport.name}
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
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <select
                          aria-label={`Trạng thái của ${tournament.name}`}
                          className="form-select h-9 min-w-36 rounded-lg border border-input bg-white pl-3 text-sm font-semibold shadow-sm outline-none transition-[border-color,box-shadow] hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
                          disabled={isUpdating || isReadOnly}
                          onChange={(event) => {
                            changeTournamentStatus(
                              tournament.id,
                              event.target.value as TournamentStatus,
                            );
                          }}
                          value={tournament.status}
                        >
                          {tournamentStatuses.map((item) => (
                            <option key={item} value={item}>
                              {tournamentStatusLabels[item]}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={isUpdating || isReadOnly}
                          onClick={() => {
                            if (isArchived)
                              changeTournamentStatus(tournament.id, TournamentStatus.DRAFT);
                            else archiveTournament(tournament.id);
                          }}
                          size="sm"
                          type="button"
                          variant={isArchived ? 'success-soft' : 'warning-soft'}
                        >
                          {isArchived ? (
                            <ArchiveRestore aria-hidden="true" className="size-4" />
                          ) : (
                            <Archive aria-hidden="true" className="size-4" />
                          )}
                          {isUpdating ? 'Đang lưu…' : isArchived ? 'Khôi phục' : 'Lưu trữ'}
                        </Button>
                        <Button asChild size="sm" variant="soft">
                          <Link to={`/admin/tournaments/${tournament.id}`}>
                            Quản lý
                            <ChevronRight aria-hidden="true" className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {archiveMutation.isError ? (
            <Alert className="mt-5" role="alert" tone="error">
              {getApiErrorMessage(archiveMutation.error, 'Không thể lưu trữ giải đấu.')}
            </Alert>
          ) : null}
          {statusMutation.isError ? (
            <Alert className="mt-5" role="alert" tone="error">
              {getApiErrorMessage(statusMutation.error, 'Không thể cập nhật trạng thái giải đấu.')}
            </Alert>
          ) : null}
        </section>

        {!isReadOnly ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-xl font-black tracking-tight">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Plus aria-hidden="true" className="size-4" />
              </span>
              Tạo giải đấu
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Thiết lập thông tin và trạng thái ban đầu cho giải đấu.
            </p>

            <form className="mt-5 space-y-4" noValidate onSubmit={handleCreate}>
              <div>
                <label className="text-sm font-semibold" htmlFor="new-tournament-sport">
                  Môn thể thao
                </label>
                {sportsQuery.isPending ? (
                  <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
                    Đang tải môn thể thao…
                  </p>
                ) : null}
                {sportsQuery.isError ? (
                  <div className="mt-2 text-sm text-destructive" role="alert">
                    <p>
                      {getApiErrorMessage(
                        sportsQuery.error,
                        'Không thể tải danh mục môn thể thao.',
                      )}
                    </p>
                    <Button
                      className="mt-2"
                      onClick={() => void sportsQuery.refetch()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Thử lại
                    </Button>
                  </div>
                ) : null}
                {sportsQuery.isSuccess && sportsQuery.data.length === 0 ? (
                  <p className="mt-2 text-sm text-destructive" role="alert">
                    Chưa có môn thể thao đang hoạt động. Không thể tạo giải đấu cho đến khi danh mục
                    được cập nhật.
                  </p>
                ) : null}
                {sportsQuery.isSuccess && sportsQuery.data.length > 0 ? (
                  <select
                    aria-describedby={formErrors.sportId ? 'new-tournament-sport-error' : undefined}
                    aria-invalid={Boolean(formErrors.sportId)}
                    className={selectClassName}
                    disabled={createMutation.isPending}
                    id="new-tournament-sport"
                    onChange={(event) => {
                      setSportId(event.target.value);
                    }}
                    required
                    value={sportId}
                  >
                    <option value="">Chọn môn thể thao</option>
                    {sportsQuery.data.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.name} — {sport.sportGroup.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {formErrors.sportId ? (
                  <p
                    className="mt-1 text-sm text-destructive"
                    id="new-tournament-sport-error"
                    role="alert"
                  >
                    {formErrors.sportId}
                  </p>
                ) : null}
              </div>
              <TournamentImagePicker
                disabled={createMutation.isPending}
                imagePath={null}
                name={name}
                onSelect={(file) => {
                  setLogoFile(file);
                }}
              />
              <div>
                <label className="text-sm font-semibold" htmlFor="new-tournament-status">
                  Trạng thái
                </label>
                <select
                  className={selectClassName}
                  disabled={createMutation.isPending}
                  id="new-tournament-status"
                  onChange={(event) => {
                    setStatus(event.target.value as TournamentStatus);
                  }}
                  value={status}
                >
                  {Object.values(TournamentStatus).map((item) => (
                    <option key={item} value={item}>
                      {tournamentStatusLabels[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold" htmlFor="new-tournament-name">
                  Tên giải đấu
                </label>
                <input
                  aria-invalid={Boolean(formErrors.name)}
                  className={inputClassName}
                  disabled={createMutation.isPending}
                  id="new-tournament-name"
                  maxLength={255}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                  value={name}
                />
                {formErrors.name ? (
                  <p className="mt-1 text-sm text-destructive">{formErrors.name}</p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-semibold" htmlFor="new-tournament-description">
                  Mô tả
                </label>
                <textarea
                  className={textAreaClassName}
                  disabled={createMutation.isPending}
                  id="new-tournament-description"
                  maxLength={5000}
                  onChange={(event) => {
                    setDescription(event.target.value);
                  }}
                  value={description}
                />
              </div>

              <div>
                <label className="text-sm font-semibold" htmlFor="new-tournament-location">
                  Địa điểm
                </label>
                <input
                  className={inputClassName}
                  disabled={createMutation.isPending}
                  id="new-tournament-location"
                  maxLength={255}
                  onChange={(event) => {
                    setLocation(event.target.value);
                  }}
                  value={location}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold" htmlFor="new-tournament-start-date">
                    Bắt đầu
                  </label>
                  <DateInput
                    className={inputClassName}
                    disabled={createMutation.isPending}
                    id="new-tournament-start-date"
                    onChange={(value) => {
                      setStartDate(value);
                    }}
                    value={startDate}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold" htmlFor="new-tournament-end-date">
                    Kết thúc
                  </label>
                  <DateInput
                    className={inputClassName}
                    disabled={createMutation.isPending}
                    id="new-tournament-end-date"
                    onChange={(value) => {
                      setEndDate(value);
                    }}
                    value={endDate}
                  />
                </div>
              </div>
              {formErrors.dates ? (
                <p className="text-sm text-destructive">{formErrors.dates}</p>
              ) : null}

              {createMutation.isError ? (
                <Alert role="alert" tone="error">
                  {getApiErrorMessage(createMutation.error, 'Không thể tạo giải đấu.')}
                </Alert>
              ) : null}

              <Button
                className="w-full"
                disabled={
                  createMutation.isPending ||
                  !sportsQuery.isSuccess ||
                  sportsQuery.data.length === 0
                }
                type="submit"
              >
                <Plus aria-hidden="true" className="size-4" />
                {createMutation.isPending ? 'Đang tạo…' : 'Tạo giải đấu'}
              </Button>
            </form>
          </section>
        ) : (
          <Alert title="Chế độ chỉ xem" tone="warning">
            <p>
              Hãy{' '}
              <Link
                className="font-bold text-primary underline underline-offset-2"
                to="/subscription"
              >
                gia hạn gói
              </Link>{' '}
              để tạo hoặc thay đổi giải đấu.
            </p>
          </Alert>
        )}
      </div>
    </div>
  );
}
