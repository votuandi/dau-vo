import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ClipboardCopyButton } from '@/components/ui/clipboard-copy-button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Dialog } from '@/components/ui/dialog';
import {
  getApiErrorMessage,
  inputClassName,
  notifyMutationError,
  notifyMutationSuccess,
} from '@/features/admin-management/presentation';
import {
  tournamentOfficialsQueryOptions,
  tournamentQueryKeys,
} from '@/features/admin-management/queries';
import { adminManagementApi, type TournamentOfficial } from '@/services/api/admin-management';
import { TournamentOfficialRole } from '@/types/shared';

const labels = { REFEREE: 'Trọng tài', INSPECTOR: 'Giám định' } as const;
function errorText(error: unknown) {
  const message = getApiErrorMessage(error, 'Không thể thực hiện yêu cầu.');
  if (message.includes('OFFICIAL_IN_ACTIVE_MATCH'))
    return 'Không thể thay đổi vì cán bộ đang được phân công trận đấu.';
  if (message.includes('OFFICIAL_COUNT_BELOW_STAFFING_REQUIREMENT'))
    return 'Không thể ngừng dùng vì không đủ trọng tài cho nhánh đấu.';
  return message;
}
function Status({ official }: { readonly official: TournamentOfficial }) {
  const style =
    official.status === 'READY'
      ? 'bg-emerald-100 text-emerald-800'
      : official.status === 'IN_MATCH'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-slate-200 text-slate-700';
  const text =
    official.status === 'READY'
      ? 'Sẵn sàng'
      : official.status === 'IN_MATCH'
        ? 'Đang trong trận'
        : 'Chưa sẵn sàng';
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`rounded-full px-2 py-1 text-xs font-bold ${style}`}>{text}</span>
      <span
        className={`rounded-full px-2 py-1 text-xs font-bold ${official.connected ? 'bg-sky-100 text-sky-800' : 'bg-muted text-muted-foreground'}`}
      >
        {official.connected ? 'Đang kết nối' : 'Ngoại tuyến'}
      </span>
    </div>
  );
}
export function TournamentOfficialsPage({
  tournamentId,
  tournamentPublicCode,
  role,
  readOnly,
}: {
  readonly tournamentId: string;
  readonly tournamentPublicCode?: string;
  readonly role: TournamentOfficialRole;
  readonly readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery(tournamentOfficialsQueryOptions(tournamentId, role));
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TournamentOfficial | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<{
    official: TournamentOfficial;
    regenerate: boolean;
  } | null>(null);
  const [passcode, setPasscode] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: tournamentQueryKeys.officials(tournamentId, role),
    });
  useEffect(() => {
    setEditing(null);
    setName('');
    setPasscode(null);
  }, [role, tournamentId]);
  const save = useMutation({
    mutationFn: () =>
      editing
        ? adminManagementApi.updateOfficial(tournamentId, editing.id, { name: name.trim() })
        : adminManagementApi.createOfficial(tournamentId, { role, name: name.trim() }),
    onSuccess: (data) => {
      invalidate();
      setEditing(null);
      setName('');
      if ('passcode' in data && typeof data.passcode === 'string') setPasscode(data.passcode);
      else notifyMutationSuccess('Đã cập nhật cán bộ.');
    },
    onError: (error) => {
      notifyMutationError(error, errorText(error));
    },
  });
  const state = useMutation({
    mutationFn: (official: TournamentOfficial) =>
      adminManagementApi.updateOfficial(tournamentId, official.id, {
        isActive: !official.isActive,
      }),
    onSuccess: () => {
      invalidate();
      setConfirm(null);
      notifyMutationSuccess('Đã cập nhật trạng thái.');
    },
    onError: (error) => {
      notifyMutationError(error, errorText(error));
    },
  });
  const regenerate = useMutation({
    mutationFn: (official: TournamentOfficial) =>
      adminManagementApi.regenerateOfficialPasscode(tournamentId, official.id),
    onSuccess: (data) => {
      invalidate();
      setConfirm(null);
      setPasscode(data.passcode);
    },
    onError: (error) => {
      notifyMutationError(error, errorText(error));
    },
  });
  const visible =
    query.data?.officials.filter((x) =>
      x.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')),
    ) ?? [];
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!save.isPending && name.trim()) save.mutate();
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{labels[role]}</h2>
          <p className="text-sm text-muted-foreground">Quản lý cán bộ của giải đấu.</p>
        </div>
        {!readOnly ? (
          <Button
            onClick={() => {
              setEditing(null);
              setName('');
            }}
            type="button"
          >
            Thêm {labels[role].toLocaleLowerCase('vi')}
          </Button>
        ) : null}
      </div>
      <label className="block max-w-md text-sm font-semibold">
        Tìm kiếm
        <input
          className={`${inputClassName} mt-1`}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          value={search}
        />
      </label>
      {!readOnly ? (
        <form
          className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={submit}
        >
          <label className="text-sm font-semibold">
            {editing ? 'Sửa tên' : `Thêm ${labels[role].toLocaleLowerCase('vi')}`}
            <input
              autoFocus
              className={`${inputClassName} mt-1`}
              maxLength={255}
              onChange={(e) => {
                setName(e.target.value);
              }}
              ref={input}
              required
              value={name}
            />
          </label>
          <Button disabled={save.isPending || !name.trim()} type="submit">
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
          {editing ? (
            <Button
              disabled={save.isPending}
              onClick={() => {
                setEditing(null);
                setName('');
              }}
              type="button"
              variant="outline"
            >
              Hủy
            </Button>
          ) : null}
        </form>
      ) : null}
      {query.isPending ? (
        <div className="grid gap-2">
          {[1, 2, 3].map((x) => (
            <div className="h-20 animate-pulse rounded-xl bg-muted" key={x} />
          ))}
        </div>
      ) : null}
      {query.isError ? (
        <div className="rounded-xl border border-destructive/30 p-4" role="alert">
          {getApiErrorMessage(query.error, 'Không thể tải danh sách.')}{' '}
          <Button
            onClick={() => {
              void query.refetch();
            }}
            size="sm"
            type="button"
          >
            Thử lại
          </Button>
        </div>
      ) : null}
      {query.isSuccess && visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center">
          Chưa có {labels[role].toLocaleLowerCase('vi')}.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {visible.map((official) => (
          <li className="rounded-xl border p-4" key={official.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{official.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {labels[official.role]} ·{' '}
                  {official.currentMatch
                    ? `Trận ${official.currentMatch.publicId}`
                    : 'Chưa được phân công'}
                </p>
                <div className="mt-2">
                  <Status official={official} />
                </div>
              </div>
              {!readOnly ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={save.isPending || state.isPending || regenerate.isPending}
                    onClick={() => {
                      setEditing(official);
                      setName(official.name);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Sửa
                  </Button>
                  <Button
                    disabled={state.isPending || regenerate.isPending}
                    onClick={() => {
                      setConfirm({ official, regenerate: false });
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {official.isActive ? 'Ngừng dùng' : 'Kích hoạt'}
                  </Button>
                  <Button
                    disabled={state.isPending || regenerate.isPending}
                    onClick={() => {
                      setConfirm({ official, regenerate: true });
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Tạo mã mới
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {confirm ? (
        <ConfirmationDialog
          actionLabel={
            confirm.regenerate
              ? 'Tạo mã mới'
              : confirm.official.isActive
                ? 'Ngừng dùng'
                : 'Kích hoạt'
          }
          busy={state.isPending || regenerate.isPending}
          description={
            confirm.regenerate
              ? 'Mã cũ sẽ mất hiệu lực và chỉ hiển thị một lần.'
              : 'Thay đổi này sẽ được máy chủ xác nhận.'
          }
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            if (confirm.regenerate) regenerate.mutate(confirm.official);
            else state.mutate(confirm.official);
          }}
          title="Xác nhận thao tác"
        />
      ) : null}
      {passcode ? (
        <Dialog
          description="Cán bộ cần cả mã giải đấu dùng chung và mã bảo mật riêng bên dưới để đăng nhập. Hãy sao chép và lưu mã bảo mật riêng ngay; mã này sẽ không hiển thị lại."
          onClose={() => {
            setPasscode(null);
          }}
          title="Mã riêng của cán bộ"
        >
          <div className="mt-4 grid gap-3">
            {tournamentPublicCode ? (
              <div>
                <p className="text-sm font-semibold">Mã giải đấu</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="select-all rounded bg-muted p-3 font-mono font-bold uppercase">
                    {tournamentPublicCode}
                  </code>
                  <ClipboardCopyButton
                    accessibleLabel="Sao chép mã giải đấu"
                    value={tournamentPublicCode}
                  />
                </div>
              </div>
            ) : null}
            <div>
              <p className="text-sm font-semibold">Mã bảo mật riêng</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="select-all rounded bg-muted p-3 font-mono font-bold">
                  {passcode}
                </code>
                <ClipboardCopyButton accessibleLabel="Sao chép mã bảo mật riêng" value={passcode} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => {
                setPasscode(null);
              }}
              type="button"
            >
              Đã lưu mã
            </Button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
