import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/features/admin-management/presentation';
import {
  superAdminApi,
  type CreateSportInput,
  type ManagedSport,
  type UpdateSportInput,
} from '@/services/api/super-admin';
import { SportForm } from './sport-form';
import {
  superAdminSportGroupsQueryOptions,
  superAdminSportKeys,
  superAdminSportsQueryOptions,
} from './query-options';

export function SuperAdminSportsPage() {
  const cache = useQueryClient();
  const sports = useQuery(superAdminSportsQueryOptions);
  const groups = useQuery(superAdminSportGroupsQueryOptions);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState<ManagedSport | undefined>();
  const [creating, setCreating] = useState(false);
  const [disableTarget, setDisableTarget] = useState<ManagedSport | undefined>();
  const refresh = async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: superAdminSportKeys.all })]);
  };
  const create = useMutation({
    mutationFn: superAdminApi.createSport,
    onSuccess: async () => {
      await refresh();
      setCreating(false);
      toast({ title: 'Đã thêm môn thể thao.', variant: 'success' });
    },
    onError: (e) =>
      toast({
        title: getApiErrorMessage(e, 'Không thể thêm môn thể thao.'),
        variant: 'destructive',
      }),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSportInput }) =>
      superAdminApi.updateSport(id, body),
    onSuccess: async () => {
      await refresh();
      setEditing(undefined);
      setDisableTarget(undefined);
      toast({ title: 'Đã cập nhật môn thể thao.', variant: 'success' });
    },
    onError: (e) =>
      toast({
        title: getApiErrorMessage(
          e,
          'Không thể cập nhật môn thể thao. Dữ liệu có thể đã thay đổi.',
        ),
        variant: 'destructive',
      }),
  });
  const filtered = useMemo(
    () =>
      (sports.data ?? []).filter(
        (sport) =>
          (!search || `${sport.name} ${sport.code}`.toLowerCase().includes(search.toLowerCase())) &&
          (!status || String(sport.isActive) === status) &&
          (!groupId || sport.sportGroupId === groupId),
      ),
    [sports.data, search, status, groupId],
  );
  const pending = create.isPending || update.isPending;
  function save(input: CreateSportInput | UpdateSportInput): void {
    if (editing) update.mutate({ id: editing.id, body: input });
    else create.mutate(input as CreateSportInput);
  }
  return (
    <section aria-busy={sports.isFetching || groups.isFetching} className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Môn thể thao</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý danh mục môn thể thao hệ thống.
          </p>
        </div>
        <Button
          disabled={groups.isPending}
          onClick={() => {
            setEditing(undefined);
            setCreating(true);
          }}
          type="button"
        >
          Thêm môn thể thao
        </Button>
      </div>
      {(creating || editing) && groups.data ? (
        <div className="mt-6 max-w-2xl">
          <SportForm
            groups={groups.data}
            onCancel={() => {
              setCreating(false);
              setEditing(undefined);
            }}
            onSubmit={save}
            pending={pending}
            {...(editing ? { sport: editing } : {})}
          />
        </div>
      ) : null}
      <div className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
        <label>
          Tìm kiếm
          <input
            aria-label="Tìm kiếm môn thể thao"
            className="mt-1 w-full rounded border p-2"
            onChange={(e) => { setSearch(e.target.value); }}
            value={search}
          />
        </label>
        <label>
          Trạng thái
          <select
            className="mt-1 w-full rounded border p-2"
            onChange={(e) => { setStatus(e.target.value); }}
            value={status}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã vô hiệu hóa</option>
          </select>
        </label>
        <label>
          Nhóm môn thể thao
          <select
            className="mt-1 w-full rounded border p-2"
            onChange={(e) => { setGroupId(e.target.value); }}
            value={groupId}
          >
            <option value="">Tất cả</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {sports.isPending ? (
        <p aria-live="polite" className="mt-6">
          Đang tải môn thể thao…
        </p>
      ) : null}
      {sports.isError || groups.isError ? (
        <div className="mt-6 rounded border border-destructive p-4" role="alert">
          Không thể tải danh mục môn thể thao.{' '}
          <Button
            onClick={() => {
              void sports.refetch();
              void groups.refetch();
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Thử lại
          </Button>
        </div>
      ) : null}
      {sports.data ? (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {['Tên', 'Mã', 'Nhóm môn thể thao', 'Trạng thái', 'Giải đấu', ''].map((h) => (
                    <th className="p-3 font-semibold" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sport) => (
                  <tr className="border-t" key={sport.id}>
                    <td className="p-3 font-semibold">{sport.name}</td>
                    <td className="p-3">{sport.code}</td>
                    <td className="p-3">
                      {sport.sportGroup.name}{' '}
                      <span className="text-muted-foreground">({sport.sportGroup.code})</span>
                    </td>
                    <td className="p-3">{sport.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</td>
                    <td className="p-3">{sport.tournamentCount}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setCreating(false);
                            setEditing(sport);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Chỉnh sửa
                        </Button>
                        {sport.isActive ? (
                          <Button
                            disabled={
                              sport.tournamentCount > 0 || sport.canDisable === false || pending
                            }
                            onClick={() => { setDisableTarget(sport); }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Vô hiệu hóa
                          </Button>
                        ) : (
                          <Button
                            disabled={pending}
                            onClick={() => { update.mutate({ id: sport.id, body: { isActive: true } }); }
                            }
                            size="sm"
                            type="button"
                          >
                            Kích hoạt
                          </Button>
                        )}
                      </div>
                      {sport.isActive && sport.tournamentCount > 0 ? (
                        <p className="mt-1 text-xs text-destructive">
                          Không thể vô hiệu hóa vì môn thể thao đã được sử dụng bởi giải đấu.
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="mt-6 rounded border p-5" role="status">
              Không có môn thể thao phù hợp.
            </p>
          ) : null}
        </>
      ) : null}
      {disableTarget ? (
        <ConfirmationDialog
          actionLabel="Vô hiệu hóa"
          busy={update.isPending}
          description={`Bạn có chắc muốn vô hiệu hóa môn ${disableTarget.name}?`}
          onCancel={() => { setDisableTarget(undefined); }}
          onConfirm={() => { update.mutate({ id: disableTarget.id, body: { isActive: false } }); }}
          title="Vô hiệu hóa môn thể thao"
          warning="Môn thể thao này sẽ không còn được dùng cho dữ liệu mới."
        />
      ) : null}
    </section>
  );
}
