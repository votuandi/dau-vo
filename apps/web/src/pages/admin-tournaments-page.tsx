import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { TournamentImage } from '@/components/tournament-image';
import { TournamentImagePicker } from '@/components/tournament-image';
import {
  getApiErrorMessage,
  inputClassName,
  notifyMutationError,
  notifyMutationSuccess,
  textAreaClassName,
  tournamentStatusLabels,
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

function tournamentStatusTagClassName(status: TournamentStatus): string {
  switch (status) {
    case TournamentStatus.DRAFT:
      return 'border border-slate-200 bg-slate-100 text-slate-700';
    case TournamentStatus.ACTIVE:
      return 'border border-emerald-200 bg-emerald-50 text-emerald-800';
    case TournamentStatus.FINISHED:
      return 'border border-blue-200 bg-blue-50 text-blue-800';
    case TournamentStatus.ARCHIVED:
      return 'border border-amber-200 bg-amber-50 text-amber-800';
    default:
      return 'border border-slate-200 bg-slate-100 text-slate-700';
  }
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

  function archiveTournament(id: string) {
    archiveMutation.mutate(id);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
            to="/admin"
          >
            ← Bảng điều khiển
          </Link>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Giải đấu</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Tạo giải đấu, cập nhật lịch và quản lý các trận thuộc từng giải.
          </p>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-black tracking-tight">Danh sách giải đấu</h2>
            {tournamentsQuery.isSuccess ? (
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                {tournamentsQuery.data.tournaments.length} giải
              </span>
            ) : null}
          </div>

          {tournamentsQuery.isPending ? (
            <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
              Đang tải giải đấu…
            </p>
          ) : null}

          {tournamentsQuery.isError ? (
            <div
              className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              role="alert"
            >
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
            </div>
          ) : null}

          {tournamentsQuery.isSuccess && tournamentsQuery.data.tournaments.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center">
              <p className="font-semibold">Chưa có giải đấu</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Dùng biểu mẫu bên cạnh để tạo giải đầu tiên.
              </p>
            </div>
          ) : null}

          {tournamentsQuery.isSuccess && tournamentsQuery.data.tournaments.length > 0 ? (
            <ul className="mt-5 divide-y divide-border">
              {tournamentsQuery.data.tournaments.map((tournament) => (
                <li className="py-5 first:pt-0 last:pb-0" key={tournament.id}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <TournamentImage
                      className="size-14 shrink-0"
                      imagePath={tournament.imagePath}
                      name={tournament.name}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="truncate text-lg font-bold hover:underline"
                          to={`/admin/tournaments/${tournament.id}`}
                        >
                          {tournament.name}
                        </Link>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${tournamentStatusTagClassName(tournament.status)}`}
                        >
                          {tournamentStatusLabels[tournament.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tournament.sport.name} · {tournament.location ?? 'Chưa có địa điểm'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/tournaments/${tournament.id}`}>Mở</Link>
                      </Button>
                      <Button
                        disabled={
                          tournament.status === TournamentStatus.ARCHIVED ||
                          (archiveMutation.isPending &&
                            archiveMutation.variables === tournament.id) ||
                          isReadOnly
                        }
                        onClick={() => {
                          archiveTournament(tournament.id);
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {archiveMutation.isPending && archiveMutation.variables === tournament.id
                          ? 'Đang lưu…'
                          : 'Lưu trữ'}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {archiveMutation.isError ? (
            <p className="mt-5 text-sm text-destructive" role="alert">
              {getApiErrorMessage(archiveMutation.error, 'Không thể lưu trữ giải đấu.')}
            </p>
          ) : null}
        </section>

        {!isReadOnly ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-black tracking-tight">Tạo giải đấu</h2>
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
                    className={inputClassName}
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
                onUpload={(file) => {
                  setLogoFile(file);
                }}
              />
              <div>
                <label className="text-sm font-semibold" htmlFor="new-tournament-status">
                  Trạng thái
                </label>
                <select
                  className={inputClassName}
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

              <div className="grid grid-cols-2 gap-3">
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
                <p
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {getApiErrorMessage(createMutation.error, 'Không thể tạo giải đấu.')}
                </p>
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
                {createMutation.isPending ? 'Đang tạo…' : 'Tạo giải đấu'}
              </Button>
            </form>
          </section>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Chế độ chỉ xem: hãy gia hạn gói để tạo hoặc thay đổi giải đấu.
          </section>
        )}
      </div>
    </div>
  );
}
