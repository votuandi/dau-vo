import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Pencil, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Dialog } from '@/components/ui/dialog';
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
import { ApiClientError } from '@/services/api/client';
import {
  adminManagementApi,
  type CreateAthleteInput,
  type TournamentAthlete,
  type TournamentOrganization,
  type TournamentRosterItem,
  type AthleteImportResult,
  type AthleteImportRow,
} from '@/services/api/admin-management';
import {
  athleteImportHeaderHelp,
  AthleteImportFileError,
  parseAthleteImportFile,
} from './athlete-import-file';
import {
  summarizeImportUnits,
  unitStatusLabel,
  type UnitImportStatus,
} from './athlete-import-summary';

const tabs = [
  ['info', 'Thông tin'],
  ['weight-classes', 'Hạng cân'],
  ['organizations', 'Đơn vị tham gia'],
  ['athletes', 'Vận động viên'],
  ['matches', 'Trận đấu'],
  ['judges', 'Giám định'],
  ['supervisors', 'Giám sát'],
] as const;
const organizationImageMaxBytes = 2 * 1024 * 1024;
const organizationImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const athleteImageMaxBytes = 2 * 1024 * 1024;
const athleteImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
class OrganizationImageUploadError extends Error {
  constructor(
    readonly organization: TournamentOrganization,
    readonly file: File,
  ) {
    super('Organization was created but its image could not be uploaded.');
  }
}
class AthleteImageUploadError extends Error {
  constructor(
    readonly athlete: TournamentAthlete,
    readonly draft: CreateAthleteInput & { readonly file: File },
  ) {
    super('Athlete was saved but its image could not be uploaded.');
  }
}
function ImportReviewSection({
  records,
  title,
}: {
  readonly title: string;
  readonly records: readonly {
    readonly id: number;
    readonly label: string;
    readonly eligible: boolean;
    readonly reason: string;
  }[];
}) {
  const eligible = records.filter((record) => record.eligible);
  const ineligible = records.filter((record) => !record.eligible);
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-black">{title}</h3>
      <div>
        <p className="font-bold text-emerald-700">Có thể thêm ({eligible.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {eligible.map((record) => (
            <li key={record.id}>{record.label}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-bold text-destructive">Không thể thêm ({ineligible.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {ineligible.map((record) => (
            <li key={record.id}>
              {record.label}
              {record.reason ? ` — ${record.reason}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
function ImportCompletionSection({
  added,
  notAdded,
  title,
}: {
  readonly title: string;
  readonly added: readonly { readonly id: number; readonly label: string }[];
  readonly notAdded: readonly {
    readonly id: number;
    readonly label: string;
    readonly reason: string;
  }[];
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-black">{title}</h3>
      <div>
        <p className="font-bold text-emerald-700">Đã thêm ({added.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {added.map((record) => (
            <li key={record.id}>{record.label}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-bold text-destructive">Không thêm được ({notAdded.length})</p>
        <ul className="list-disc space-y-1 pl-5">
          {notAdded.map((record) => (
            <li key={record.id}>
              {record.label} — {record.reason}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
function ImportUnitSection({
  records,
  title,
}: {
  readonly title: string;
  readonly records: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: UnitImportStatus;
    readonly errors: readonly string[];
  }[];
}) {
  const groups: readonly { readonly status: UnitImportStatus; readonly tone: string }[] = [
    { status: 'pending', tone: 'text-emerald-700' },
    { status: 'created', tone: 'text-emerald-700' },
    { status: 'existing', tone: 'text-muted-foreground' },
    { status: 'restored', tone: 'text-emerald-700' },
    { status: 'invalid', tone: 'text-destructive' },
  ];
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="font-black">{title}</h3>
      {groups.map(({ status, tone }) => {
        const items = records.filter((record) => record.status === status);
        if (!items.length) return null;
        return (
          <div key={status}>
            <p className={`font-bold ${tone}`}>
              {unitStatusLabel(status)} ({items.length})
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {items.map((record) => (
                <li key={record.id}>
                  {record.label}
                  {record.errors.length ? ` — ${record.errors.join(', ')}` : ''}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
type Tab = (typeof tabs)[number][0];

export function TournamentTabs({
  tournamentId,
  active,
}: {
  readonly tournamentId: string;
  readonly active: Tab;
}) {
  return (
    <nav aria-label="Khu vực quản lý giải đấu" className="overflow-x-auto border-b">
      <div className="flex min-w-max gap-1">
        {tabs.map(([id, label]) => (
          <Link
            aria-current={id === active ? 'page' : undefined}
            className={
              id === active
                ? 'border-b-2 border-primary px-3 py-3 text-sm font-bold'
                : 'px-3 py-3 text-sm text-muted-foreground hover:text-foreground'
            }
            key={id}
            to={
              id === 'info'
                ? `/admin/tournaments/${tournamentId}`
                : `/admin/tournaments/${tournamentId}/${id}`
            }
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function RosterForm({
  mode,
  values,
  onCancel,
  onSubmit,
  onValuesChange,
  busy,
  organization,
}: {
  readonly mode: 'create' | 'edit';
  readonly values: RosterValues;
  readonly onCancel: () => void;
  readonly onSubmit: (input: {
    name: string;
    location?: string | null;
    details: string | null;
    file: File | null;
  }) => void;
  readonly onValuesChange: (values: RosterValues) => void;
  readonly busy: boolean;
  readonly organization: boolean;
}) {
  return (
    <form
      aria-label={mode === 'edit' ? 'Chỉnh sửa danh mục' : 'Tạo danh mục mới'}
      className={`grid gap-4 rounded-xl border bg-muted/30 p-4 ${
        organization ? 'grid-cols-1' : 'sm:grid-cols-[1fr_2fr_auto]'
      }`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && values.name.trim()) {
          onSubmit({
            name: values.name.trim(),
            ...(organization ? { location: values.location.trim() || null } : {}),
            details: values.details.trim() || null,
            file: values.file,
          });
        }
      }}
    >
      <p
        aria-live="polite"
        className={`text-sm font-semibold ${organization ? '' : 'sm:col-span-3'}`}
      >
        {mode === 'edit' ? 'Đang chỉnh sửa danh mục' : 'Tạo danh mục mới'}
      </p>
      <label className="form-field">
        Tên
        <input
          className={inputClassName}
          maxLength={255}
          onChange={(e) => {
            onValuesChange({ ...values, name: e.target.value });
          }}
          required
          value={values.name}
        />
      </label>
      {organization ? (
        <label className="form-field">
          Địa phương
          <input
            className={inputClassName}
            maxLength={255}
            onChange={(e) => {
              onValuesChange({ ...values, location: e.target.value });
            }}
            value={values.location}
          />
        </label>
      ) : null}
      {organization ? (
        <label className="form-field">
          Logo đơn vị (JPEG, PNG hoặc WebP, tối đa 2 MiB)
          <input
            accept="image/jpeg,image/png,image/webp"
            className={inputClassName}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              const error =
                file && !organizationImageTypes.includes(file.type)
                  ? 'Logo phải là ảnh JPEG, PNG hoặc WebP.'
                  : file && file.size > organizationImageMaxBytes
                    ? 'Logo không được vượt quá 2 MiB.'
                    : '';
              onValuesChange({ ...values, file: error ? null : file, imageError: error });
            }}
            type="file"
          />
          {values.file ? (
            <>
              <span className="block text-xs font-normal">
                {values.file.name} · {(values.file.size / 1024).toFixed(1)} KiB
              </span>
              <img
                alt="Xem trước logo đơn vị"
                className="mt-2 h-16 w-16 rounded object-cover"
                src={URL.createObjectURL(values.file)}
              />
            </>
          ) : null}
          {values.imageError ? (
            <span className="block text-xs text-destructive" role="alert">
              {values.imageError}
            </span>
          ) : null}
        </label>
      ) : null}
      <label className="form-field">
        Chi tiết
        <textarea
          className={textAreaClassName}
          maxLength={5000}
          onChange={(e) => {
            onValuesChange({ ...values, details: e.target.value });
          }}
          value={values.details}
        />
      </label>
      <div className="flex flex-wrap self-end gap-2">
        <Button disabled={busy} type="submit">
          {busy ? 'Đang lưu…' : mode === 'edit' ? 'Lưu' : 'Thêm mới'}
        </Button>
        <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
          Hủy
        </Button>
      </div>
    </form>
  );
}

interface RosterValues {
  readonly name: string;
  readonly location: string;
  readonly details: string;
  readonly file: File | null;
  readonly imageError: string;
}

type RosterDraft =
  | { readonly mode: 'create'; readonly values: RosterValues }
  | { readonly mode: 'edit'; readonly item: TournamentRosterItem; readonly values: RosterValues }
  | null;

const emptyRosterValues = (): RosterValues => ({
  name: '',
  location: '',
  details: '',
  file: null,
  imageError: '',
});

function rosterValues(item: TournamentRosterItem): RosterValues {
  return {
    name: item.name,
    location: (item as TournamentOrganization).location ?? '',
    details: item.details ?? '',
    file: null,
    imageError: '',
  };
}

export function RosterItemsPage({
  tournamentId,
  kind,
  readOnly,
}: {
  readonly tournamentId: string;
  readonly kind: 'organizations' | 'weight-classes';
  readonly readOnly: boolean;
}) {
  const qc = useQueryClient();
  const submitLock = useRef(false);
  const query = useQuery({
    // Keep the array projection separate from the full endpoint response cached by
    // tournamentOrganizationsQueryOptions/tournamentWeightClassesQueryOptions.
    queryKey: ['admin', 'tournaments', tournamentId, kind, 'roster-items'],
    queryFn: async (): Promise<readonly TournamentRosterItem[]> =>
      kind === 'organizations'
        ? (await adminManagementApi.listOrganizations(tournamentId)).organizations
        : (await adminManagementApi.listWeightClasses(tournamentId)).weightClasses,
  });
  const [draft, setDraft] = useState<RosterDraft>(null);
  const [confirm, setConfirm] = useState<TournamentRosterItem | null>(null);
  const noun = kind === 'organizations' ? 'đơn vị' : 'hạng cân';
  const mutate = useMutation({
    mutationFn: async ({
      itemId,
      input,
    }: {
      itemId: string | undefined;
      input: { name: string; location?: string | null; details: string | null; file: File | null };
    }) => {
      const textInput = {
        name: input.name,
        ...(kind === 'organizations' ? { location: input.location ?? null } : {}),
        details: input.details,
      };
      if (itemId) {
        if (kind === 'organizations') {
          await adminManagementApi.updateOrganization(tournamentId, itemId, textInput);
          if (input.file)
            await adminManagementApi.replaceOrganizationImage(tournamentId, itemId, input.file);
        } else await adminManagementApi.updateWeightClass(tournamentId, itemId, textInput);
      } else if (kind === 'organizations') {
        const created = await adminManagementApi.createOrganization(tournamentId, textInput);
        if (input.file) {
          try {
            await adminManagementApi.replaceOrganizationImage(
              tournamentId,
              created.organization.id,
              input.file,
            );
          } catch {
            throw new OrganizationImageUploadError(created.organization, input.file);
          }
        }
      } else await adminManagementApi.createWeightClass(tournamentId, textInput);
    },
    onSuccess: () => {
      submitLock.current = false;
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId] });
      notifyMutationSuccess(`Đã lưu ${noun}.`);
      setDraft(null);
    },
    onError: (e) => {
      submitLock.current = false;
      if (e instanceof OrganizationImageUploadError) {
        setDraft({
          mode: 'edit',
          item: e.organization,
          values: { ...rosterValues(e.organization), file: e.file },
        });
        notifyMutationError(
          e,
          'Đơn vị đã được tạo, nhưng tải logo thất bại. Hãy thử tải logo lại.',
        );
        return;
      }
      notifyMutationError(e, 'Không thể lưu thay đổi.');
    },
  });
  const deactivate = useMutation({
    mutationFn: async (item: TournamentRosterItem) => {
      if (item.isActive) {
        if (kind === 'organizations')
          await adminManagementApi.deleteOrganization(tournamentId, item.id);
        else await adminManagementApi.deleteWeightClass(tournamentId, item.id);
      } else if (kind === 'organizations')
        await adminManagementApi.updateOrganization(tournamentId, item.id, { isActive: true });
      else await adminManagementApi.updateWeightClass(tournamentId, item.id, { isActive: true });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId] });
      notifyMutationSuccess('Đã cập nhật trạng thái.');
      setConfirm(null);
    },
    onError: (e) => {
      notifyMutationError(
        e,
        kind === 'weight-classes' &&
          e instanceof ApiClientError &&
          e.body.code === 'WEIGHT_CLASS_IN_USE'
          ? 'Hạng cân đang được vận động viên hoặc trận đấu sử dụng. Hãy chuyển các vận động viên/trận liên quan trước.'
          : 'Không thể cập nhật trạng thái.',
      );
    },
  });
  const removeOrganizationImage = useMutation({
    mutationFn: (id: string) => adminManagementApi.removeOrganizationImage(tournamentId, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId] });
      notifyMutationSuccess('Đã xóa logo đơn vị.');
    },
    onError: (e) => {
      notifyMutationError(e, 'Không thể xóa logo đơn vị.');
    },
  });
  const items = query.data ?? [];
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-black">
          {kind === 'organizations' ? 'Đơn vị tham gia' : 'Hạng cân'}
        </h2>
        <p className="text-sm text-muted-foreground">Quản lý danh mục sử dụng trong giải đấu.</p>
      </div>
      {!readOnly ? (
        draft ? (
          <RosterForm
            busy={mutate.isPending}
            mode={draft.mode}
            organization={kind === 'organizations'}
            onCancel={() => {
              setDraft(null);
            }}
            onSubmit={(input) => {
              if (!mutate.isPending && !submitLock.current) {
                submitLock.current = true;
                mutate.mutate({ itemId: draft.mode === 'edit' ? draft.item.id : undefined, input });
              }
            }}
            onValuesChange={(values) => {
              setDraft((current) => (current ? { ...current, values } : current));
            }}
            values={draft.values}
          />
        ) : (
          <Button
            disabled={mutate.isPending || deactivate.isPending}
            onClick={() => {
              setDraft({ mode: 'create', values: emptyRosterValues() });
            }}
            type="button"
          >
            Thêm {noun}
          </Button>
        )
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
      {query.isSuccess && items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Chưa có {noun} nào.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {items.map((item) => (
          <li className="rounded-xl border p-4" key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {kind === 'organizations' ? (
                  <div className="mb-2 flex items-center gap-2">
                    {(item as TournamentOrganization).imagePath ? (
                      <img
                        alt={`Logo ${item.name}`}
                        className="h-12 w-12 rounded object-cover"
                        loading="lazy"
                        src={`/api/media/${(item as TournamentOrganization).imagePath ?? ''}`}
                      />
                    ) : (
                      <span
                        aria-label={`Chưa có logo cho ${item.name}`}
                        className="flex h-12 w-12 items-center justify-center rounded bg-muted text-xs"
                        role="img"
                      >
                        ĐV
                      </span>
                    )}
                    <h3 className="font-bold">{item.name}</h3>
                  </div>
                ) : (
                  <h3 className="font-bold">{item.name}</h3>
                )}
                {kind === 'organizations' ? (
                  <p className="text-sm text-muted-foreground">
                    {(item as TournamentOrganization).location ?? 'Chưa có địa phương'}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {item.details ?? 'Chưa có chi tiết'}
                </p>
                <p className="mt-1 text-xs font-semibold">
                  {item.isActive ? 'Đang hoạt động' : 'Đã ngừng'}
                </p>
              </div>
              {!readOnly ? (
                <div className="flex gap-2">
                  <Button
                    disabled={
                      mutate.isPending || deactivate.isPending || removeOrganizationImage.isPending
                    }
                    onClick={() => {
                      setDraft({ mode: 'edit', item, values: rosterValues(item) });
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Sửa
                  </Button>
                  {kind === 'organizations' && (item as TournamentOrganization).imagePath ? (
                    <Button
                      disabled={removeOrganizationImage.isPending}
                      onClick={() => {
                        removeOrganizationImage.mutate(item.id);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Xóa logo
                    </Button>
                  ) : null}
                  <Button
                    disabled={mutate.isPending || deactivate.isPending}
                    onClick={() => {
                      setConfirm(item);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {item.isActive ? 'Ngừng dùng' : 'Khôi phục'}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {confirm ? (
        <ConfirmationDialog
          actionLabel={confirm.isActive ? 'Đình chỉ thi đấu' : 'Cho phép thi đấu'}
          busy={deactivate.isPending}
          description={
            kind === 'organizations'
              ? 'Các vận động viên đang thuộc đơn vị này sẽ trở thành “Không đơn vị”.'
              : 'Hạng cân chỉ có thể ngừng dùng khi không còn vận động viên hoặc trận đấu sử dụng.'
          }
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            if (!deactivate.isPending) deactivate.mutate(confirm);
          }}
          title={`${confirm.isActive ? 'Ngừng dùng' : 'Khôi phục'} ${noun}?`}
        />
      ) : null}
    </section>
  );
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
  useEffect(() => {
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
  }, [search, setParams]);
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
    mutationFn: (athlete: TournamentAthlete) => adminManagementApi.deleteAthlete(tournamentId, athlete.id),
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
      n.set('page', '1');
      return n;
    });
  }
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-black">Vận động viên</h2>
        <p className="text-sm text-muted-foreground">Tìm kiếm và lọc danh sách đăng ký.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
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
              accept="image/jpeg,image/png,image/webp"
              className={inputClassName}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                const imageError =
                  file && !athleteImageTypes.includes(file.type)
                    ? 'Ảnh phải là JPEG, PNG hoặc WebP.'
                    : file && file.size > athleteImageMaxBytes
                      ? 'Ảnh không được vượt quá 2 MiB.'
                      : '';
                setDraft({ ...draft, file: imageError ? null : file, imageError });
              }}
              type="file"
            />
            {draft.file ? (
              <>
                <span className="block text-xs">
                  {draft.file.name} · {(draft.file.size / 1024).toFixed(1)} KiB
                </span>
                <img
                  alt="Xem trước ảnh đại diện"
                  className="mt-2 h-16 w-16 rounded-full object-cover"
                  src={URL.createObjectURL(draft.file)}
                />
              </>
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
            <li className="rounded-xl border p-3" key={x.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {x.imageUrl ? (
                    <img
                      alt={`Ảnh đại diện ${x.name}`}
                      className="h-12 w-12 rounded-full object-cover"
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
                      <b>{x.name}</b>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                        {x.birthYear}
                      </span>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                        {x.organization?.name ?? 'Không đơn vị'}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {x.weightClass.name}
                      </span>
                    </div>
                    {x.details ? (
                      <p className="mt-1 text-sm text-muted-foreground">{x.details}</p>
                    ) : null}
                  </div>
                </div>
                {!readOnly ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      aria-label={x.isSeed ? 'Hạt giống' : 'Chọn làm hạt giống'}
                      className={
                        x.isSeed
                          ? 'bg-blue-300 text-white shadow-none hover:bg-blue-400'
                          : 'border border-blue-200 bg-blue-50 text-white shadow-none hover:bg-blue-100'
                      }
                      disabled={toggleSeed.isPending}
                      onClick={() => {
                        toggleSeed.mutate(x);
                      }}
                      size="icon"
                      title={x.isSeed ? 'Hạt giống' : 'Chọn làm hạt giống'}
                      type="button"
                    >
                      <Star
                        aria-hidden="true"
                        className={`size-4 ${x.isSeed ? '' : 'text-blue-200'}`}
                        fill={x.isSeed ? 'currentColor' : 'none'}
                      />
                    </Button>
                    <Button
                      aria-label="Sửa"
                      className="bg-blue-200 text-white shadow-none hover:bg-blue-300"
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
                          ? 'bg-blue-400 text-white shadow-none hover:bg-blue-500'
                          : 'bg-blue-300 text-white shadow-none hover:bg-blue-400'
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
                      className="bg-red-500 text-white shadow-none hover:bg-red-600"
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
        <div className="flex gap-2">
          <Button
            disabled={filters.page <= 1}
            onClick={() => {
              updateParam('page', String(filters.page - 1));
            }}
            type="button"
          >
            Trước
          </Button>
          <span className="py-2 text-sm">
            Trang {filters.page}/{query.data.totalPages}
          </span>
          <Button
            disabled={filters.page >= query.data.totalPages}
            onClick={() => {
              updateParam('page', String(filters.page + 1));
            }}
            type="button"
          >
            Sau
          </Button>
        </div>
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
