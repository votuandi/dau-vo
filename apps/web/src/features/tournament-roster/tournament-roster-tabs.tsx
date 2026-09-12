import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
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
  type AthleteInput,
  type TournamentRosterItem,
} from '@/services/api/admin-management';

const tabs = [
  ['info', 'Thông tin'],
  ['weight-classes', 'Hạng cân'],
  ['organizations', 'Đơn vị tham gia'],
  ['athletes', 'Vận động viên'],
  ['matches', 'Trận đấu'],
] as const;
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
}: {
  readonly mode: 'create' | 'edit';
  readonly values: RosterValues;
  readonly onCancel: () => void;
  readonly onSubmit: (input: { name: string; details: string | null }) => void;
  readonly onValuesChange: (values: RosterValues) => void;
  readonly busy: boolean;
}) {
  return (
    <form
      aria-label={mode === 'edit' ? 'Chỉnh sửa danh mục' : 'Tạo danh mục mới'}
      className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-[1fr_2fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && values.name.trim()) {
          onSubmit({ name: values.name.trim(), details: values.details.trim() || null });
        }
      }}
    >
      <p aria-live="polite" className="sm:col-span-3 text-sm font-semibold">
        {mode === 'edit' ? 'Đang chỉnh sửa danh mục' : 'Tạo danh mục mới'}
      </p>
      <label className="text-sm font-semibold">
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
      <label className="text-sm font-semibold">
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
      <div className="flex self-end gap-2">
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
  readonly details: string;
}

type RosterDraft =
  | { readonly mode: 'create'; readonly values: RosterValues }
  | { readonly mode: 'edit'; readonly item: TournamentRosterItem; readonly values: RosterValues }
  | null;

const emptyRosterValues = (): RosterValues => ({ name: '', details: '' });

function rosterValues(item: TournamentRosterItem): RosterValues {
  return { name: item.name, details: item.details ?? '' };
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
      input: { name: string; details: string | null };
    }) => {
      if (itemId) {
        if (kind === 'organizations')
          await adminManagementApi.updateOrganization(tournamentId, itemId, input);
        else await adminManagementApi.updateWeightClass(tournamentId, itemId, input);
      } else if (kind === 'organizations')
        await adminManagementApi.createOrganization(tournamentId, input);
      else await adminManagementApi.createWeightClass(tournamentId, input);
    },
    onSuccess: () => {
      submitLock.current = false;
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId] });
      notifyMutationSuccess(`Đã lưu ${noun}.`);
      setDraft(null);
    },
    onError: (e) => {
      submitLock.current = false;
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
                <h3 className="font-bold">{item.name}</h3>
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
                    disabled={mutate.isPending || deactivate.isPending}
                    onClick={() => {
                      setDraft({ mode: 'edit', item, values: rosterValues(item) });
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Sửa
                  </Button>
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
          actionLabel={confirm.isActive ? 'Xác nhận ngừng dùng' : 'Khôi phục'}
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
  const [draft, setDraft] = useState<AthleteInput | null>(null);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (x: AthleteInput) => adminManagementApi.createAthlete(tournamentId, x),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'tournaments', tournamentId, 'athletes'] });
      notifyMutationSuccess('Đã thêm vận động viên.');
    },
    onError: (e) => {
      notifyMutationError(e, 'Không thể thêm vận động viên.');
    },
  });
  // The roster endpoints are independently loaded. Treat a response without either
  // collection as an empty roster while it is refreshed instead of crashing the tab.
  const weightClasses = weights.data?.weightClasses ?? [];
  const organizationsList = organizations.data?.organizations ?? [];
  const activeWeights = weightClasses.filter((x) => x.isActive);
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
          <Button
            onClick={() => {
              setDraft({
                name: '',
                birthYear: new Date().getFullYear(),
                weightClassId: activeWeights[0]?.id ?? '',
                organizationId: null,
                details: null,
              });
            }}
            type="button"
          >
            Thêm vận động viên
          </Button>
        ) : (
          <Button asChild>
            <Link to={`/admin/tournaments/${tournamentId}/weight-classes`}>Tạo hạng cân trước</Link>
          </Button>
        ))}
      {draft ? (
        <form
          className="grid gap-3 rounded-xl border p-4"
          onSubmit={(e: SyntheticEvent<HTMLFormElement>) => {
            e.preventDefault();
            create.mutate(draft);
          }}
        >
          <label>
            Họ tên
            <input
              className={inputClassName}
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
              onChange={(e) => {
                setDraft({ ...draft, birthYear: Number(e.target.value) });
              }}
              required
              type="number"
              value={draft.birthYear}
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
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Đơn vị
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
          <Button disabled={create.isPending} type="submit">
            Lưu
          </Button>
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
              <b>{x.name}</b> · {x.birthYear} · {x.organization?.name ?? 'Không đơn vị'} ·{' '}
              {x.weightClass.name} · {x.isActive ? 'Đang hoạt động' : 'Đã ngừng'}
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
    </section>
  );
}
