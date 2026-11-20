import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Image, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Switch } from '@/components/ui/switch';
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
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/services/api/client';
import {
  adminManagementApi,
  type SponsorInput,
  type TournamentSponsor,
} from '@/services/api/admin-management';

const DISPLAY_INDEX_TAKEN = 'SPONSOR_DISPLAY_INDEX_ALREADY_EXISTS';
const DISPLAY_INDEX_TAKEN_MESSAGE = 'Vị trí xuất hiện này đã được nhà tài trợ khác sử dụng.';

function sponsorImageError(file: File): string {
  const problem = imageFileProblem(file);
  if (problem === 'type') return 'Logo phải là ảnh JPEG, PNG hoặc WebP.';
  if (problem === 'size') return 'Logo không được vượt quá 2 MiB.';
  return '';
}

function isDisplayIndexTaken(error: unknown): boolean {
  return error instanceof ApiClientError && error.body.code === DISPLAY_INDEX_TAKEN;
}

class SponsorImageUploadError extends Error {
  constructor(
    readonly sponsor: TournamentSponsor,
    readonly file: File,
  ) {
    super('Sponsor was created but its logo could not be uploaded.');
  }
}

interface SponsorValues {
  readonly name: string;
  readonly details: string;
  readonly tier: string;
  readonly tierName: string;
  readonly displayIndex: string;
  readonly isDisabled: boolean;
  readonly file: File | null;
  readonly imageError: string;
}

type SponsorDraft =
  | { readonly mode: 'create'; readonly values: SponsorValues }
  | { readonly mode: 'edit'; readonly item: TournamentSponsor; readonly values: SponsorValues }
  | null;

function emptySponsorValues(items: readonly TournamentSponsor[]): SponsorValues {
  const lastIndex = items.reduce((max, item) => Math.max(max, item.displayIndex), 0);
  return {
    name: '',
    details: '',
    tier: '1',
    tierName: '',
    displayIndex: String(lastIndex + 1),
    isDisabled: false,
    file: null,
    imageError: '',
  };
}

function sponsorValues(item: TournamentSponsor): SponsorValues {
  return {
    name: item.name,
    details: item.details ?? '',
    tier: String(item.tier),
    tierName: item.tierName,
    displayIndex: String(item.displayIndex),
    isDisabled: item.isDisabled,
    file: null,
    imageError: '',
  };
}

/** Positive whole number, or null when the field is not one. */
function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : null;
}

interface SponsorSubmission extends Required<Omit<SponsorInput, 'details'>> {
  readonly details: string | null;
  readonly file: File | null;
}

function SponsorForm({
  mode,
  values,
  takenIndexes,
  busy,
  onCancel,
  onSubmit,
  onValuesChange,
}: {
  readonly mode: 'create' | 'edit';
  readonly values: SponsorValues;
  /** Positions used by the other sponsors, for an early duplicate warning. */
  readonly takenIndexes: ReadonlySet<number>;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: SponsorSubmission) => void;
  readonly onValuesChange: (values: SponsorValues) => void;
}) {
  const tier = positiveInteger(values.tier);
  const displayIndex = positiveInteger(values.displayIndex);
  const indexTaken = displayIndex !== null && takenIndexes.has(displayIndex);
  const valid =
    values.name.trim() !== '' &&
    values.tierName.trim() !== '' &&
    tier !== null &&
    displayIndex !== null &&
    !indexTaken;
  return (
    <form
      aria-label={mode === 'edit' ? 'Chỉnh sửa nhà tài trợ' : 'Thêm nhà tài trợ'}
      className="grid grid-cols-1 gap-4 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !valid) return;
        onSubmit({
          name: values.name.trim(),
          details: values.details.trim() || null,
          tier,
          tierName: values.tierName.trim(),
          displayIndex,
          isDisabled: values.isDisabled,
          file: values.file,
        });
      }}
    >
      <p aria-live="polite" className="text-base font-black sm:col-span-2">
        {mode === 'edit' ? 'Đang chỉnh sửa nhà tài trợ' : 'Thêm nhà tài trợ mới'}
      </p>
      <label className="form-field sm:col-span-2">
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
      <label className="form-field">
        Bậc tài trợ
        <input
          aria-describedby="sponsor-tier-hint"
          className={inputClassName}
          inputMode="numeric"
          max={1_000_000}
          min={1}
          onChange={(e) => {
            onValuesChange({ ...values, tier: e.target.value });
          }}
          required
          step={1}
          type="number"
          value={values.tier}
        />
        <span className="block text-xs font-normal text-muted-foreground" id="sponsor-tier-hint">
          Bắt đầu từ 1 — số càng nhỏ, vị thế càng cao.
        </span>
      </label>
      <label className="form-field">
        Tên bậc tài trợ
        <input
          className={inputClassName}
          maxLength={255}
          onChange={(e) => {
            onValuesChange({ ...values, tierName: e.target.value });
          }}
          placeholder="Ví dụ: Kim cương, Vàng, Đồng hành…"
          required
          value={values.tierName}
        />
      </label>
      <label className="form-field">
        Vị trí xuất hiện
        <input
          aria-describedby="sponsor-index-hint"
          aria-invalid={indexTaken || undefined}
          className={inputClassName}
          inputMode="numeric"
          max={1_000_000}
          min={1}
          onChange={(e) => {
            onValuesChange({ ...values, displayIndex: e.target.value });
          }}
          required
          step={1}
          type="number"
          value={values.displayIndex}
        />
        {indexTaken ? (
          <span className="form-error block" id="sponsor-index-hint" role="alert">
            {DISPLAY_INDEX_TAKEN_MESSAGE}
          </span>
        ) : (
          <span className="block text-xs font-normal text-muted-foreground" id="sponsor-index-hint">
            Thứ tự hiển thị trong danh sách; không trùng với nhà tài trợ khác.
          </span>
        )}
      </label>
      <div className="flex items-center sm:pt-6">
        <Switch
          checked={values.isDisabled}
          description="Nhà tài trợ vẫn được lưu nhưng không còn hiển thị là đang tài trợ."
          label="Ngừng tài trợ"
          onCheckedChange={(isDisabled) => {
            onValuesChange({ ...values, isDisabled });
          }}
        />
      </div>
      <label className="form-field sm:col-span-2">
        Logo (JPEG, PNG hoặc WebP, tối đa 2 MiB)
        <input
          accept={IMAGE_ACCEPT}
          className={inputClassName}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            const error = file ? sponsorImageError(file) : '';
            onValuesChange({ ...values, file: error ? null : file, imageError: error });
          }}
          type="file"
        />
        {values.file ? (
          <FileImagePreview
            alt="Xem trước logo nhà tài trợ"
            className="size-16 rounded"
            file={values.file}
          />
        ) : null}
        {values.imageError ? (
          <span className="form-error block" role="alert">
            {values.imageError}
          </span>
        ) : null}
      </label>
      <label className="form-field sm:col-span-2">
        Thông tin chi tiết
        <textarea
          className={textAreaClassName}
          maxLength={5000}
          onChange={(e) => {
            onValuesChange({ ...values, details: e.target.value });
          }}
          value={values.details}
        />
      </label>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
        <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
          Hủy
        </Button>
        <Button disabled={busy || !valid} type="submit">
          {busy ? 'Đang lưu…' : mode === 'edit' ? 'Lưu' : 'Thêm mới'}
        </Button>
      </div>
    </form>
  );
}

interface PendingAction {
  readonly kind: 'toggle' | 'delete';
  readonly item: TournamentSponsor;
}

export function SponsorsPage({
  tournamentId,
  readOnly,
}: {
  readonly tournamentId: string;
  readonly readOnly: boolean;
}) {
  const qc = useQueryClient();
  const queryKey = ['admin', 'tournaments', tournamentId, 'sponsors'] as const;
  const submitLock = useRef(false);
  const query = useQuery({
    queryKey,
    queryFn: async () => (await adminManagementApi.listSponsors(tournamentId)).sponsors,
  });
  const [draft, setDraft] = useState<SponsorDraft>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const logoSponsorId = useRef<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey });

  const updateLogo = useMutation({
    mutationFn: ({ sponsorId, file }: { sponsorId: string; file: File }) =>
      adminManagementApi.replaceSponsorImage(tournamentId, sponsorId, file),
    onSuccess: () => {
      void refresh();
      notifyMutationSuccess('Đã cập nhật logo.');
    },
    onError: (error) => {
      notifyMutationError(error, 'Không thể cập nhật logo.');
    },
  });

  const save = useMutation({
    mutationFn: async ({
      sponsorId,
      input: { file, ...input },
    }: {
      sponsorId: string | undefined;
      input: SponsorSubmission;
    }) => {
      if (sponsorId) {
        await adminManagementApi.updateSponsor(tournamentId, sponsorId, input);
        if (file) await adminManagementApi.replaceSponsorImage(tournamentId, sponsorId, file);
        return;
      }
      const created = await adminManagementApi.createSponsor(tournamentId, input);
      if (file) {
        try {
          await adminManagementApi.replaceSponsorImage(tournamentId, created.sponsor.id, file);
        } catch {
          throw new SponsorImageUploadError(created.sponsor, file);
        }
      }
    },
    onSuccess: () => {
      submitLock.current = false;
      void refresh();
      notifyMutationSuccess('Đã lưu nhà tài trợ.');
      setDraft(null);
    },
    onError: (e) => {
      submitLock.current = false;
      if (e instanceof SponsorImageUploadError) {
        void refresh();
        setDraft({
          mode: 'edit',
          item: e.sponsor,
          values: { ...sponsorValues(e.sponsor), file: e.file },
        });
        notifyMutationError(
          e,
          'Nhà tài trợ đã được tạo, nhưng tải logo thất bại. Hãy thử tải logo lại.',
        );
        return;
      }
      notifyMutationError(
        e,
        isDisplayIndexTaken(e) ? DISPLAY_INDEX_TAKEN_MESSAGE : 'Không thể lưu thay đổi.',
      );
    },
  });

  const act = useMutation({
    mutationFn: async ({ kind, item }: PendingAction) => {
      if (kind === 'delete') await adminManagementApi.deleteSponsor(tournamentId, item.id);
      else
        await adminManagementApi.updateSponsor(tournamentId, item.id, {
          isDisabled: !item.isDisabled,
        });
    },
    onSuccess: (_data, { kind }) => {
      void refresh();
      notifyMutationSuccess(kind === 'delete' ? 'Đã xóa nhà tài trợ.' : 'Đã cập nhật trạng thái.');
      setPending(null);
    },
    onError: (e, { kind }) => {
      notifyMutationError(
        e,
        kind === 'delete' ? 'Không thể xóa nhà tài trợ.' : 'Không thể cập nhật trạng thái.',
      );
    },
  });

  const items = query.data ?? [];
  const busy = save.isPending || act.isPending;
  const editingId = draft?.mode === 'edit' ? draft.item.id : null;
  const takenIndexes = new Set(
    items.filter((item) => item.id !== editingId).map((item) => item.displayIndex),
  );

  return (
    <section className="space-y-5">
      {!readOnly ? (
        <input
          accept={IMAGE_ACCEPT}
          aria-label="Chọn logo nhà tài trợ"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            const sponsorId = logoSponsorId.current;
            event.target.value = '';
            if (!file || !sponsorId || updateLogo.isPending) return;
            const imageError = sponsorImageError(file);
            if (imageError) {
              toast({ title: imageError, variant: 'destructive' });
              return;
            }
            updateLogo.mutate({ sponsorId, file });
          }}
          ref={logoInput}
          type="file"
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            Nhà tài trợ
            {query.isSuccess ? <Badge tone="primary">{items.length}</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            Quản lý nhà tài trợ của giải đấu, sắp theo vị trí xuất hiện.
          </p>
        </div>
        {!readOnly && !draft ? (
          <Button
            disabled={busy || !query.isSuccess}
            onClick={() => {
              setDraft({ mode: 'create', values: emptySponsorValues(items) });
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            Thêm nhà tài trợ
          </Button>
        ) : null}
      </div>
      {!readOnly && draft ? (
        <SponsorForm
          busy={save.isPending}
          mode={draft.mode}
          onCancel={() => {
            setDraft(null);
          }}
          onSubmit={(input) => {
            if (!save.isPending && !submitLock.current) {
              submitLock.current = true;
              save.mutate({ sponsorId: editingId ?? undefined, input });
            }
          }}
          onValuesChange={(values) => {
            setDraft((current) => (current ? { ...current, values } : current));
          }}
          takenIndexes={takenIndexes}
          values={draft.values}
        />
      ) : null}
      {query.isPending ? (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Đang tải…
        </p>
      ) : null}
      {query.isError ? (
        <Alert role="alert" tone="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            Không thể tải.
            <Button onClick={() => void query.refetch()} size="sm" type="button" variant="outline">
              Thử lại
            </Button>
          </div>
        </Alert>
      ) : null}
      {query.isSuccess && items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Chưa có nhà tài trợ nào.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {items.map((item) => (
          <li
            className={cn(
              'rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-md',
              item.isDisabled && 'bg-muted/40',
            )}
            key={item.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-label={`Vị trí xuất hiện ${String(item.displayIndex)}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-black tabular-nums text-muted-foreground"
                  title="Vị trí xuất hiện"
                >
                  {item.displayIndex}
                </span>
                {item.imagePath ? (
                  <img
                    alt={`Logo ${item.name}`}
                    className="size-12 shrink-0 rounded-lg bg-white object-contain"
                    loading="lazy"
                    src={tournamentImageUrl(item.imagePath) ?? ''}
                  />
                ) : (
                  <span
                    aria-label={`Chưa có logo cho ${item.name}`}
                    className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-black text-primary"
                    role="img"
                  >
                    {item.name.trim().slice(0, 1).toLocaleUpperCase('vi')}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="break-words">{item.name}</b>
                    <Badge tone="primary">
                      Bậc {item.tier} · {item.tierName}
                    </Badge>
                    {item.isDisabled ? (
                      <Badge dot tone="warning">
                        Ngừng tài trợ
                      </Badge>
                    ) : null}
                  </div>
                  {item.details ? (
                    <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">
                      {item.details}
                    </p>
                  ) : null}
                </div>
              </div>
              {!readOnly ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    aria-label="Cập nhật logo"
                    disabled={busy || updateLogo.isPending}
                    onClick={() => {
                      logoSponsorId.current = item.id;
                      logoInput.current?.click();
                    }}
                    size="sm"
                    title="Cập nhật logo"
                    type="button"
                    variant="outline"
                  >
                    <Image aria-hidden="true" className="size-4" />
                    Logo
                  </Button>
                  <Button
                    aria-label="Sửa"
                    disabled={busy}
                    onClick={() => {
                      setDraft({ mode: 'edit', item, values: sponsorValues(item) });
                    }}
                    size="sm"
                    type="button"
                    variant="soft"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Sửa
                  </Button>
                  <Button
                    aria-label={item.isDisabled ? 'Tài trợ lại' : 'Ngừng tài trợ'}
                    disabled={busy}
                    onClick={() => {
                      setPending({ kind: 'toggle', item });
                    }}
                    size="sm"
                    type="button"
                    variant={item.isDisabled ? 'success-soft' : 'warning-soft'}
                  >
                    {item.isDisabled ? (
                      <RotateCcw aria-hidden="true" className="size-4" />
                    ) : (
                      <Ban aria-hidden="true" className="size-4" />
                    )}
                    {item.isDisabled ? 'Tài trợ lại' : 'Ngừng tài trợ'}
                  </Button>
                  <Button
                    aria-label="Xóa"
                    disabled={busy}
                    onClick={() => {
                      setPending({ kind: 'delete', item });
                    }}
                    size="sm"
                    type="button"
                    variant="destructive-soft"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Xóa
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {pending ? (
        <ConfirmationDialog
          actionLabel={
            pending.kind === 'delete'
              ? 'Xóa nhà tài trợ'
              : pending.item.isDisabled
                ? 'Tài trợ lại'
                : 'Ngừng tài trợ'
          }
          busy={act.isPending}
          description={
            pending.kind === 'delete'
              ? `“${pending.item.name}” sẽ bị gỡ khỏi danh sách và vị trí xuất hiện ${String(pending.item.displayIndex)} được giải phóng.`
              : pending.item.isDisabled
                ? `“${pending.item.name}” sẽ được đánh dấu là đang tài trợ trở lại.`
                : `“${pending.item.name}” vẫn ở trong danh sách nhưng được đánh dấu ngừng tài trợ.`
          }
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={() => {
            if (!act.isPending) act.mutate(pending);
          }}
          title={
            pending.kind === 'delete'
              ? 'Xóa nhà tài trợ?'
              : pending.item.isDisabled
                ? 'Tài trợ lại?'
                : 'Ngừng tài trợ?'
          }
        />
      ) : null}
    </section>
  );
}
