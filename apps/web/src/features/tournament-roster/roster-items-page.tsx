import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Image, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { FileImagePreview } from '@/components/file-image-preview';
import { tournamentImageUrl } from '@/components/tournament-image';
import { toast } from '@/components/ui/toast';
import {
  inputClassName,
  notifyMutationError,
  notifyMutationSuccess,
  textAreaClassName,
} from '@/features/admin-management/presentation';
import { IMAGE_ACCEPT, imageFileProblem } from '@/lib/image-file';
import { ApiClientError } from '@/services/api/client';
import {
  adminManagementApi,
  type TournamentOrganization,
  type TournamentRosterItem,
} from '@/services/api/admin-management';

function organizationImageError(file: File): string {
  const problem = imageFileProblem(file);
  if (problem === 'type') return 'Logo phải là ảnh JPEG, PNG hoặc WebP.';
  if (problem === 'size') return 'Logo không được vượt quá 2 MiB.';
  return '';
}

class OrganizationImageUploadError extends Error {
  constructor(
    readonly organization: TournamentOrganization,
    readonly file: File,
  ) {
    super('Organization was created but its image could not be uploaded.');
  }
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
      className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/30 p-4"
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
      <p aria-live="polite" className="text-sm font-semibold">
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
            accept={IMAGE_ACCEPT}
            className={inputClassName}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              const error = file ? organizationImageError(file) : '';
              onValuesChange({ ...values, file: error ? null : file, imageError: error });
            }}
            type="file"
          />
          {values.file ? (
            <FileImagePreview
              alt="Xem trước logo đơn vị"
              className="size-16 rounded"
              file={values.file}
            />
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
  const logoInput = useRef<HTMLInputElement>(null);
  const logoOrganizationId = useRef<string | null>(null);
  const updateLogo = useMutation({
    mutationFn: ({ organizationId, file }: { organizationId: string; file: File }) =>
      adminManagementApi.replaceOrganizationImage(tournamentId, organizationId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId] });
      notifyMutationSuccess('Đã cập nhật logo.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật logo.');
    },
  });
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
  const items = query.data ?? [];
  return (
    <section className="space-y-5">
      {kind === 'organizations' && !readOnly ? (
        <input
          accept={IMAGE_ACCEPT}
          aria-label="Chọn logo đơn vị"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const organizationId = logoOrganizationId.current;
            event.target.value = '';
            if (!file || !organizationId || updateLogo.isPending) return;
            const imageError = organizationImageError(file);
            if (imageError) {
              toast({ title: imageError, variant: 'destructive' });
              return;
            }
            updateLogo.mutate({ organizationId, file });
          }}
          ref={logoInput}
          type="file"
        />
      ) : null}
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
          <li
            className={
              kind === 'organizations'
                ? 'rounded-xl border p-3 bg-white/30'
                : 'rounded-xl border p-4 bg-white/30'
            }
            key={item.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              {kind === 'organizations' ? (
                <div className="flex min-w-0 items-center gap-3">
                  {(item as TournamentOrganization).imagePath ? (
                    <img
                      alt={`Logo ${item.name}`}
                      className="size-12 shrink-0 rounded-full object-cover"
                      loading="lazy"
                      src={tournamentImageUrl((item as TournamentOrganization).imagePath) ?? ''}
                    />
                  ) : (
                    <span
                      aria-label={`Chưa có logo cho ${item.name}`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-xs"
                      role="img"
                    >
                      {item.name.trim().slice(0, 1).toLocaleUpperCase('vi')}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <b className="break-words">{item.name}</b>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
                        {(item as TournamentOrganization).location ?? 'Chưa có địa phương'}
                      </span>
                    </div>
                    {item.details ? (
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {item.details}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <h3 className="break-words font-bold">{item.name}</h3>
                  <p className="break-words text-sm text-muted-foreground">
                    {item.details ?? 'Chưa có chi tiết'}
                  </p>
                  <p className="mt-1 text-xs font-semibold">
                    {item.isActive ? 'Đang hoạt động' : 'Đã ngừng'}
                  </p>
                </div>
              )}
              {!readOnly ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {kind === 'organizations' ? (
                    <Button
                      aria-label="Cập nhật logo"
                      className="border-sky-200 bg-sky-100 text-sky-700 shadow-none hover:bg-sky-200 hover:text-sky-800"
                      disabled={mutate.isPending || deactivate.isPending || updateLogo.isPending}
                      onClick={() => {
                        logoOrganizationId.current = item.id;
                        logoInput.current?.click();
                      }}
                      size="icon"
                      title="Cập nhật logo"
                      type="button"
                      variant="outline"
                    >
                      <Image aria-hidden="true" className="size-4" />
                    </Button>
                  ) : null}
                  <Button
                    aria-label="Sửa"
                    className={
                      kind === 'organizations'
                        ? 'bg-sky-600 text-white shadow-none hover:bg-sky-800'
                        : undefined
                    }
                    disabled={mutate.isPending || deactivate.isPending}
                    onClick={() => {
                      setDraft({ mode: 'edit', item, values: rosterValues(item) });
                    }}
                    size={kind === 'organizations' ? 'icon' : 'sm'}
                    title={kind === 'organizations' ? 'Sửa' : undefined}
                    type="button"
                    variant={kind === 'organizations' ? undefined : 'outline'}
                  >
                    {kind === 'organizations' ? (
                      <Pencil aria-hidden="true" className="size-4" />
                    ) : (
                      'Sửa'
                    )}
                  </Button>
                  <Button
                    aria-label={item.isActive ? 'Ngừng dùng' : 'Khôi phục'}
                    className={
                      kind === 'organizations'
                        ? item.isActive
                          ? 'bg-orange-700 text-white shadow-none hover:bg-orange-800'
                          : 'bg-green-700 text-white shadow-none hover:bg-green-800'
                        : undefined
                    }
                    disabled={mutate.isPending || deactivate.isPending}
                    onClick={() => {
                      setConfirm(item);
                    }}
                    size={kind === 'organizations' ? 'icon' : 'sm'}
                    title={
                      kind === 'organizations'
                        ? item.isActive
                          ? 'Ngừng dùng'
                          : 'Khôi phục'
                        : undefined
                    }
                    type="button"
                    variant={kind === 'organizations' ? undefined : 'outline'}
                  >
                    {kind === 'organizations' ? (
                      item.isActive ? (
                        <Ban aria-hidden="true" className="size-4" />
                      ) : (
                        <Check aria-hidden="true" className="size-4" />
                      )
                    ) : item.isActive ? (
                      'Ngừng dùng'
                    ) : (
                      'Khôi phục'
                    )}
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
