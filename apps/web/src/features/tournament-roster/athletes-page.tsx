import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Pencil, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Dialog } from '@/components/ui/dialog';
import { FileImagePreview } from '@/components/file-image-preview';
import { toast } from '@/components/ui/toast';
import {
  inputClassName,
  notifyMutationError,
  notifyMutationSuccess,
  textAreaClassName,
} from '@/features/admin-management/presentation';
import {
  tournamentAthletesQueryOptions,
  tournamentOrganizationsQueryOptions,
  tournamentWeightClassesQueryOptions,
} from '@/features/admin-management/queries';
import { IMAGE_ACCEPT, imageFileProblem } from '@/lib/image-file';
import {
  adminManagementApi,
  type CreateAthleteInput,
  type TournamentAthlete,
  type AthleteImportResult,
  type AthleteImportRow,
} from '@/services/api/admin-management';
import {
  athleteImportHeaderHelp,
  AthleteImportFileError,
  parseAthleteImportFile,
} from './athlete-import-file';
import { summarizeImportUnits } from './athlete-import-summary';
import { ImportCompletionSection, ImportReviewSection, ImportUnitSection } from './import-sections';

function athleteImageError(file: File): string {
  const problem = imageFileProblem(file);
  if (problem === 'type') return 'Ảnh phải là JPEG, PNG hoặc WebP.';
  if (problem === 'size') return 'Ảnh không được vượt quá 2 MiB.';
  return '';
}

class AthleteImageUploadError extends Error {
  constructor(
    readonly athlete: TournamentAthlete,
    readonly draft: CreateAthleteInput & { readonly file: File },
  ) {
    super('Athlete was saved but its image could not be uploaded.');
  }
}

export function AthletesPage({
  tournamentId,
  readOnly,
}: {
  readonly tournamentId: string;
  readonly readOnly: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const appliedSearch = params.get('search') ?? '';
  useEffect(() => {
    if (search === appliedSearch) return;
    const timer = window.setTimeout(() => {
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          if (search) next.set('search', search);
          else next.delete('search');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search, appliedSearch, setParams]);
  const searchParam = params.get('search');
  const weightClassIdParam = params.get('weightClassId');
  const organizationIdParam = params.get('organizationId');
  const filters = {
    page: Number(params.get('page') ?? '1'),
    pageSize: 25,
    ...(searchParam ? { search: searchParam } : {}),
    ...(weightClassIdParam ? { weightClassId: weightClassIdParam } : {}),
    ...(organizationIdParam ? { organizationId: organizationIdParam } : {}),
    ...(params.get('noOrganization') === 'true' ? { noOrganization: true } : {}),
    ...(params.get('isActive') ? { isActive: params.get('isActive') === 'true' } : {}),
  };
  const query = useQuery(tournamentAthletesQueryOptions(tournamentId, filters));
  const weights = useQuery(tournamentWeightClassesQueryOptions(tournamentId));
  const organizations = useQuery(tournamentOrganizationsQueryOptions(tournamentId));
  type AthleteDraft = CreateAthleteInput & {
    readonly file: File | null;
    readonly imageError: string;
  };
  const [draft, setDraft] = useState<AthleteDraft | null>(null);
  const [editing, setEditing] = useState<TournamentAthlete | null>(null);
  const [confirm, setConfirm] = useState<TournamentAthlete | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<TournamentAthlete | null>(null);
  const [importPreview, setImportPreview] = useState<{
    rows: readonly AthleteImportRow[];
    results: readonly AthleteImportResult[];
    idempotencyKey: string;
  } | null>(null);
  const [importResults, setImportResults] = useState<readonly AthleteImportResult[] | null>(null);
  const submitLock = useRef(false);
  const importFilePicker = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  useEffect(() => {
    if (query.data && query.data.totalPages > 0 && filters.page > query.data.totalPages) {
      setParams(
        (old) => {
          const next = new URLSearchParams(old);
          next.set('page', String(query.data.totalPages));
          return next;
        },
        { replace: true },
      );
    }
  }, [filters.page, query.data, setParams]);
  const save = useMutation({
    mutationFn: async ({
      input,
      athlete,
    }: {
      input: AthleteDraft;
      athlete: TournamentAthlete | null;
    }) => {
      const text = {
        name: input.name.trim(),
        birthYear: input.birthYear,
        weightClassId: input.weightClassId,
        organizationId: input.organizationId ?? null,
        details: input.details?.trim() ?? null,
        isSeed: input.isSeed ?? false,
      };
      const result = athlete
        ? await adminManagementApi.updateAthlete(tournamentId, athlete.id, text)
        : await adminManagementApi.createAthlete(tournamentId, text);
      if (input.file) {
        try {
          await adminManagementApi.replaceAthleteImage(tournamentId, result.athlete.id, input.file);
        } catch (error) {
          if (!athlete)
            throw new AthleteImageUploadError(result.athlete, { ...input, file: input.file });
          throw error;
        }
      }
      return result.athlete;
    },
    onSuccess: () => {
      setDraft(null);
      setEditing(null);
      submitLock.current = false;
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId, 'athletes'] });
      notifyMutationSuccess('Đã lưu vận động viên.');
    },
    onError: (e) => {
      submitLock.current = false;
      if (e instanceof AthleteImageUploadError) {
        setEditing(e.athlete);
        setDraft({ ...e.draft, imageError: '' });
        notifyMutationError(
          e,
          'Vận động viên đã được tạo, nhưng tải ảnh thất bại. Hãy thử tải ảnh lại.',
        );
        return;
      }
      notifyMutationError(
        e,
        'Không thể lưu vận động viên. Thông tin đã lưu có thể được giữ lại nếu lỗi xảy ra khi tải ảnh.',
      );
    },
  });
  const deactivate = useMutation({
    mutationFn: (athlete: TournamentAthlete) =>
      athlete.isActive
        ? adminManagementApi.updateAthlete(tournamentId, athlete.id, { isActive: false })
        : adminManagementApi.updateAthlete(tournamentId, athlete.id, { isActive: true }),
    onSuccess: () => {
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId, 'athletes'] });
      notifyMutationSuccess('Đã cập nhật trạng thái vận động viên.');
    },
    onError: (e) => {
      notifyMutationError(
        e,
        'Không thể cập nhật trạng thái. Nếu khôi phục bị từ chối, hãy chọn hạng cân hoặc đơn vị đang hoạt động rồi lưu lại.',
      );
    },
  });
  const toggleSeed = useMutation({
    mutationFn: (athlete: TournamentAthlete) =>
      adminManagementApi.updateAthlete(tournamentId, athlete.id, { isSeed: !athlete.isSeed }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId, 'athletes'] });
      notifyMutationSuccess('Đã cập nhật hạt giống.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật hạt giống.');
    },
  });
  const softDelete = useMutation({
    mutationFn: (athlete: TournamentAthlete) =>
      adminManagementApi.deleteAthlete(tournamentId, athlete.id),
    onSuccess: () => {
      setDeleteConfirm(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId, 'athletes'] });
      notifyMutationSuccess('Đã xóa vận động viên.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể xóa vận động viên.');
    },
  });
  const previewImport = useMutation({
    mutationFn: (rows: readonly AthleteImportRow[]) =>
      adminManagementApi.previewAthleteImport(tournamentId, rows),
    onSuccess: (result) => {
      setImportPreview({ ...result, idempotencyKey: crypto.randomUUID() });
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể tạo bản xem trước dữ liệu nhập.');
    },
  });
  const confirmImport = useMutation({
    mutationFn: (preview: NonNullable<typeof importPreview>) =>
      adminManagementApi.confirmAthleteImport(tournamentId, preview.rows, preview.idempotencyKey),
    onSuccess: (result) => {
      setImportPreview(null);
      setImportResults(result.results);
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId, 'athletes'] });
      notifyMutationSuccess('Đã xử lý dữ liệu nhập.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể xác nhận nhập dữ liệu.');
    },
  });
  // The roster endpoints are independently loaded. Treat a response without either
  // collection as an empty roster while it is refreshed instead of crashing the tab.
  const weightClasses = weights.data?.weightClasses ?? [];
  const organizationsList = organizations.data?.organizations ?? [];
  const activeWeights = weightClasses.filter((x) => x.isActive);
  const activeUnlockedWeights = activeWeights.filter((x) => !x.hasCurrentBracket);
  function updateParam(key: string, value: string) {
    setParams((old) => {
      const n = new URLSearchParams(old);
      if (value) n.set(key, value);
      else n.delete(key);
      if (key !== 'page') n.set('page', '1');
      return n;
    });
  }
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-black">Vận động viên</h2>
        <p className="text-sm text-muted-foreground">Tìm kiếm và lọc danh sách đăng ký.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Tìm tên
          <input
            aria-label="Tìm vận động viên"
            className={inputClassName}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            value={search}
          />
        </label>
        <label className="text-sm">
          Hạng cân
          <select
            className={inputClassName}
            onChange={(e) => {
              updateParam('weightClassId', e.target.value);
            }}
            value={params.get('weightClassId') ?? ''}
          >
            <option value="">Tất cả</option>
            {weightClasses.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Đơn vị
          <select
            className={inputClassName}
            onChange={(e) => {
              const value = e.target.value;
              updateParam('organizationId', value === '__none' ? '' : value);
              updateParam('noOrganization', value === '__none' ? 'true' : '');
            }}
            value={
              params.get('noOrganization') === 'true'
                ? '__none'
                : (params.get('organizationId') ?? '')
            }
          >
            <option value="">Tất cả</option>
            <option value="__none">Không đơn vị</option>
            {organizationsList
              .filter((x) => x.isActive)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Trạng thái
          <select
            className={inputClassName}
            onChange={(e) => {
              updateParam('isActive', e.target.value);
            }}
            value={params.get('isActive') ?? ''}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã ngừng</option>
          </select>
        </label>
      </div>
      {!readOnly &&
        (activeWeights.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!activeUnlockedWeights.length}
              onClick={() => {
                setDraft({
                  name: '',
                  birthYear: new Date().getFullYear(),
                  weightClassId: activeUnlockedWeights[0]?.id ?? '',
                  organizationId: null,
                  details: null,
                  isSeed: false,
                  file: null,
                  imageError: '',
                });
                setEditing(null);
              }}
              type="button"
            >
              Thêm vận động viên
            </Button>
            <Button
              className="bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/25"
              disabled={previewImport.isPending || confirmImport.isPending}
              onClick={() => importFilePicker.current?.click()}
              title={`Chấp nhận đúng một tệp .xlsx, .xls hoặc .csv. Tệp có thể không có tiêu đề; chỉ bỏ dòng đầu nếu khớp chính xác: ${athleteImportHeaderHelp}. Thứ tự 5 cột bắt buộc là như trên.`}
              type="button"
            >
              Thêm từ file Excel
            </Button>
          </div>
        ) : (
          <Button asChild>
            <Link to={`/admin/tournaments/${tournamentId}/weight-classes`}>Tạo hạng cân trước</Link>
          </Button>
        ))}
      {!readOnly && activeWeights.length > 0 && !activeUnlockedWeights.length ? (
        <p className="text-sm text-muted-foreground">
          Không thể thêm vận động viên vì tất cả hạng cân đang hoạt động đã được chia nhánh đấu.
        </p>
      ) : null}
      {!readOnly ? (
        <input
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          disabled={previewImport.isPending || confirmImport.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            void parseAthleteImportFile(file)
              .then((rows) => {
                previewImport.mutate(rows);
              })
              .catch((error: unknown) => {
                toast({
                  title:
                    error instanceof AthleteImportFileError
                      ? error.message
                      : 'Tệp không hợp lệ: không thể đọc tệp.',
                  variant: 'destructive',
                });
              });
          }}
          ref={importFilePicker}
          type="file"
        />
      ) : null}
      {importPreview ? (
        <Dialog
          className="max-w-2xl"
          description="Xem lại kết quả trước khi xác nhận. Dữ liệu chưa được lưu cho đến khi chọn OK."
          onClose={() => {
            setImportPreview(null);
          }}
          pending={confirmImport.isPending}
          title="Xem trước nhập vận động viên"
        >
          <div className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto text-sm">
            <ImportUnitSection
              title="Đơn vị tham gia"
              records={summarizeImportUnits(importPreview.results)}
            />
            <ImportReviewSection
              title="Vận động viên"
              records={importPreview.results.map((result) => ({
                id: result.inputIndex,
                label: `Dòng ${String(result.rowNumber)}: ${result.athlete.name}`,
                eligible: result.status === 'eligible',
                reason: result.athlete.errors.join(', '),
              }))}
            />
          </div>
          <div className="mt-5 flex gap-2">
            <Button
              disabled={
                confirmImport.isPending ||
                !importPreview.results.some((result) => result.status === 'eligible')
              }
              onClick={() => {
                if (!confirmImport.isPending) confirmImport.mutate(importPreview);
              }}
              type="button"
            >
              {confirmImport.isPending ? 'Đang xác nhận…' : 'OK'}
            </Button>
            <Button
              disabled={confirmImport.isPending}
              onClick={() => {
                setImportPreview(null);
              }}
              type="button"
              variant="outline"
            >
              Hủy
            </Button>
          </div>
        </Dialog>
      ) : null}
      {importResults ? (
        <Dialog
          className="max-w-2xl"
          description="Kết quả xử lý từng dòng trong tệp nhập."
          onClose={() => {
            setImportResults(null);
          }}
          title="Hoàn tất nhập vận động viên"
        >
          <div className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto text-sm">
            <ImportCompletionSection
              title="Vận động viên"
              added={importResults
                .filter((x) => x.athlete.status === 'created')
                .map((x) => ({
                  id: x.inputIndex,
                  label: `Dòng ${String(x.rowNumber)}: ${x.athlete.name}`,
                }))}
              notAdded={importResults
                .filter((x) => x.athlete.status !== 'created')
                .map((x) => ({
                  id: x.inputIndex,
                  label: `Dòng ${String(x.rowNumber)}: ${x.athlete.name}`,
                  reason: x.athlete.errors.join(', ') || 'Không thể thêm vận động viên.',
                }))}
            />
            <ImportUnitSection
              title="Đơn vị tham gia"
              records={summarizeImportUnits(importResults)}
            />
          </div>
          <div className="mt-5">
            <Button
              onClick={() => {
                setImportResults(null);
              }}
              type="button"
            >
              Đóng
            </Button>
          </div>
        </Dialog>
      ) : null}
      {draft ? (
        <form
          className="grid gap-3 rounded-xl border p-4"
          onSubmit={(e: SyntheticEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (!save.isPending && !submitLock.current && draft.name.trim() && !draft.imageError) {
              submitLock.current = true;
              save.mutate({ input: draft, athlete: editing });
            }
          }}
        >
          <label>
            Tên vận động viên
            <input
              className={inputClassName}
              maxLength={255}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
              }}
              required
              value={draft.name}
            />
          </label>
          <label>
            Năm sinh
            <input
              className={inputClassName}
              min="1900"
              max={new Date().getFullYear()}
              onChange={(e) => {
                setDraft({ ...draft, birthYear: Number(e.target.value) });
              }}
              required
              type="number"
              value={draft.birthYear}
            />
          </label>
          <label>
            Thông tin chi tiết
            <textarea
              className={textAreaClassName}
              maxLength={5000}
              onChange={(e) => {
                setDraft({ ...draft, details: e.target.value });
              }}
              value={draft.details ?? ''}
            />
          </label>
          <label>
            Hạng cân
            <select
              className={inputClassName}
              onChange={(e) => {
                setDraft({ ...draft, weightClassId: e.target.value });
              }}
              value={draft.weightClassId}
            >
              {activeWeights.map((x) => (
                <option
                  disabled={x.hasCurrentBracket && x.id !== editing?.weightClassId}
                  key={x.id}
                  value={x.id}
                >
                  {x.name}
                  {x.hasCurrentBracket ? ' — Đã chia nhánh đấu' : ''}
                </option>
              ))}
            </select>
            {activeWeights.some((x) => x.hasCurrentBracket) ? (
              <span className="block text-xs text-muted-foreground">
                Hạng cân đã được chia nhánh đấu
              </span>
            ) : null}
          </label>
          <label>
            Đơn vị tham gia
            <select
              className={inputClassName}
              onChange={(e) => {
                setDraft({ ...draft, organizationId: e.target.value || null });
              }}
              value={draft.organizationId ?? ''}
            >
              <option value="">Không đơn vị</option>
              {organizationsList
                .filter((x) => x.isActive)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={draft.isSeed ?? false}
              onChange={(e) => {
                setDraft({ ...draft, isSeed: e.target.checked });
              }}
              type="checkbox"
            />
            Hạt giống
          </label>
          <label>
            Ảnh đại diện (JPEG, PNG hoặc WebP, tối đa 2 MiB)
            <input
              accept={IMAGE_ACCEPT}
              className={inputClassName}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                const imageError = file ? athleteImageError(file) : '';
                setDraft({ ...draft, file: imageError ? null : file, imageError });
              }}
              type="file"
            />
            {draft.file ? (
              <FileImagePreview
                alt="Xem trước ảnh đại diện"
                className="size-16 rounded-full"
                file={draft.file}
              />
            ) : null}
            {draft.imageError ? (
              <span className="block text-xs text-destructive" role="alert">
                {draft.imageError}
              </span>
            ) : null}
          </label>
          <div className="flex gap-2">
            <Button disabled={save.isPending || !!draft.imageError} type="submit">
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() => {
                setDraft(null);
                setEditing(null);
              }}
              type="button"
              variant="outline"
            >
              Hủy
            </Button>
          </div>
        </form>
      ) : null}
      {query.isPending ? <p>Đang tải…</p> : null}
      {query.isError ? (
        <div role="alert">
          Không thể tải.{' '}
          <Button onClick={() => void query.refetch()} size="sm" type="button">
            Thử lại
          </Button>
        </div>
      ) : null}
      {query.data?.items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center">
          Không tìm thấy vận động viên.
        </p>
      ) : (
        <ul className="grid gap-2">
          {query.data?.items.map((x) => (
            <li className="rounded-xl border p-3 bg-white/30" key={x.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {x.imageUrl ? (
                    <img
                      alt={`Ảnh đại diện ${x.name}`}
                      className="size-12 shrink-0 rounded-full object-cover"
                      loading="lazy"
                      src={x.imageUrl}
                    />
                  ) : (
                    <span
                      aria-label={`Chưa có ảnh đại diện cho ${x.name}`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted font-bold"
                      role="img"
                    >
                      {x.name.trim().slice(0, 1).toLocaleUpperCase('vi')}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="break-words">{x.name}</b>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                        {x.birthYear}
                      </span>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
                        {x.organization?.name ?? 'Không đơn vị'}
                      </span>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                        {x.weightClass.name}
                      </span>
                    </div>
                    {x.details ? (
                      <p className="mt-1 break-words text-sm text-muted-foreground">{x.details}</p>
                    ) : null}
                  </div>
                </div>
                {!readOnly ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      aria-label={x.isSeed ? 'Hạt giống' : 'Chọn làm hạt giống'}
                      className={
                        x.isSeed
                          ? 'bg-amber-200 text-amber-500 shadow-none hover:bg-blue-50 hover:text-amber-200'
                          : 'border border-blue-200 bg-blue-50 text-blue-200 shadow-none hover:bg-amber-100 hover:text-amber-500 hover:border-none'
                      }
                      disabled={toggleSeed.isPending}
                      onClick={() => {
                        toggleSeed.mutate(x);
                      }}
                      size="icon"
                      title={
                        x.isSeed
                          ? 'Đang là Hạt giống. Nhấn vào sẽ hủy tư cách'
                          : 'Chọn làm hạt giống'
                      }
                      type="button"
                    >
                      <Star
                        aria-hidden="true"
                        className={`size-4`}
                        fill={x.isSeed ? 'currentColor' : 'none'}
                      />
                    </Button>
                    <Button
                      aria-label="Sửa"
                      className="bg-sky-600 text-white shadow-none hover:bg-sky-800"
                      disabled={save.isPending || deactivate.isPending}
                      onClick={() => {
                        setEditing(x);
                        setDraft({
                          name: x.name,
                          birthYear: x.birthYear,
                          weightClassId: x.weightClassId,
                          organizationId: x.organizationId,
                          details: x.details,
                          isSeed: x.isSeed,
                          file: null,
                          imageError: '',
                        });
                      }}
                      size="icon"
                      title="Sửa"
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      aria-label={x.isActive ? 'Đình chỉ thi đấu' : 'Cho phép thi đấu'}
                      className={
                        x.isActive
                          ? 'bg-orange-700 text-white shadow-none hover:bg-orange-800'
                          : 'bg-green-700 text-white shadow-none hover:bg-green-800'
                      }
                      disabled={deactivate.isPending || softDelete.isPending}
                      onClick={() => {
                        setConfirm(x);
                      }}
                      size="icon"
                      title={x.isActive ? 'Đình chỉ thi đấu' : 'Cho phép thi đấu'}
                      type="button"
                    >
                      {x.isActive ? (
                        <Ban aria-hidden="true" className="size-4" />
                      ) : (
                        <Check aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                    <Button
                      aria-label="Xóa"
                      disabled={deactivate.isPending || softDelete.isPending}
                      onClick={() => {
                        setDeleteConfirm(x);
                      }}
                      size="icon"
                      title="Xóa"
                      type="button"
                      variant="destructive"
                      className="bg-red-600 text-white shadow-none hover:bg-red-700"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.data && query.data.totalPages > 1 ? (
        <Pagination
          onPageChange={(page) => {
            updateParam('page', String(page));
          }}
          page={filters.page}
          totalPages={query.data.totalPages}
        />
      ) : null}
      {confirm ? (
        <ConfirmationDialog
          actionLabel={confirm.isActive ? 'Xác nhận ngừng dùng' : 'Khôi phục'}
          busy={deactivate.isPending}
          description={
            confirm.isActive
              ? 'Vận động viên sẽ không còn được chọn cho trận đấu mới.'
              : 'Hạng cân và đơn vị hiện tại phải đang hoạt động để khôi phục.'
          }
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            deactivate.mutate(confirm);
          }}
          title={`${confirm.isActive ? 'Đình chỉ thi đấu' : 'Cho phép thi đấu'}?`}
        />
      ) : null}
      {deleteConfirm ? (
        <ConfirmationDialog
          actionLabel="Xóa"
          busy={softDelete.isPending}
          description={`Vận động viên “${deleteConfirm.name}” sẽ bị xóa mềm và không còn đủ điều kiện thi đấu.`}
          onCancel={() => {
            setDeleteConfirm(null);
          }}
          onConfirm={() => {
            if (!softDelete.isPending) softDelete.mutate(deleteConfirm);
          }}
          title="Xóa vận động viên?"
          warning="Bạn vẫn có thể khôi phục dữ liệu theo quy trình quản trị nếu cần."
        />
      ) : null}
    </section>
  );
}
