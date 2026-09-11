import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DateTimeInput } from '@/components/ui/date-input';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/components/ui/toast';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { formatDate, formatDateTime } from '@/features/admin-management/presentation';
import { ApiClientError } from '@/services/api/client';
import { superAdminApi, type AdminAccessInput, type ManagedUser } from '@/services/api/super-admin';
import { superAdminUserKeys } from './query-keys';
import { localDateTimeInputToIso, toLocalDateTimeInput } from './local-date-time';

type ProfileField = 'username' | 'fullName' | 'email' | 'phone' | 'organization';
type ConfirmAction =
  | 'deactivate'
  | 'reactivate'
  | 'delete'
  | 'restore'
  | 'suspend'
  | 'resume'
  | 'revoke'
  | 'reactivateEntitlement'
  | null;
const fields: readonly ProfileField[] = ['username', 'fullName', 'email', 'phone', 'organization'];
const labels: Record<ProfileField, string> = {
  username: 'Tên đăng nhập',
  fullName: 'Họ và tên',
  email: 'Email',
  phone: 'Điện thoại',
  organization: 'Đơn vị',
};
const codeText: Record<string, string> = {
  CANNOT_MODIFY_SELF: 'Không thể thực hiện thao tác này với chính tài khoản đang đăng nhập.',
  LAST_SUPER_ADMIN: 'Không thể thay đổi siêu quản trị viên đang hoạt động cuối cùng.',
  INVALID_ENTITLEMENT_PERIOD: 'Thời hạn quyền quản trị không hợp lệ.',
  ENTITLEMENT_NOT_FOUND: 'Không tìm thấy quyền quản trị để thực hiện thao tác này.',
  USER_DELETED: 'Hãy khôi phục người dùng trước khi thay đổi quyền quản trị.',
  USER_NOT_DELETED: 'Người dùng này chưa bị xóa mềm nên không thể khôi phục.',
  CANNOT_CHANGE_SUPER_ADMIN_ENTITLEMENT:
    'Không thể thay đổi quyền quản trị của siêu quản trị viên.',
  USERNAME_ALREADY_EXISTS: 'Tên đăng nhập đã được sử dụng.',
  EMAIL_ALREADY_EXISTS: 'Email đã được sử dụng.',
  PHONE_ALREADY_EXISTS: 'Số điện thoại đã được sử dụng.',
  INVALID_PHONE: 'Số điện thoại không hợp lệ.',
};
function profileOf(user: ManagedUser): Record<ProfileField, string> {
  return {
    username: user.username,
    fullName: user.fullName ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    organization: user.organization ?? '',
  };
}
function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? (codeText[error.body.code ?? ''] ?? 'Thao tác không thành công.')
    : 'Thao tác không thành công.';
}
function money(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function SuperAdminUserDetailPage() {
  const { id = '' } = useParams();
  const cache = useQueryClient();
  const detail = useQuery({
    queryKey: superAdminUserKeys.detail(id),
    queryFn: () => superAdminApi.user(id),
  });
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<ProfileField, string> | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [pendingActivation, setPendingActivation] = useState<AdminAccessInput | null>(null);
  const invalidate = async () => {
    await cache.invalidateQueries({ queryKey: superAdminUserKeys.all });
    await cache.invalidateQueries({ queryKey: ['super-admin', 'users'] });
  };
  const profile = useMutation({
    mutationFn: (body: Record<ProfileField, string>) => superAdminApi.update(id, body),
    onSuccess: async () => {
      setEditing(false);
      setFieldErrors({});
      await invalidate();
      toast({ title: 'Đã lưu hồ sơ.', variant: 'success' });
    },
    onError: (error) => {
      const code = error instanceof ApiClientError ? error.body.code : undefined;
      const field =
        code === 'USERNAME_ALREADY_EXISTS'
          ? 'username'
          : code === 'EMAIL_ALREADY_EXISTS'
            ? 'email'
            : 'phone';
      setFieldErrors({ [field]: errorMessage(error) });
    },
  });
  const action = useMutation({
    mutationFn: async ({ kind, access }: { kind: ConfirmAction; access?: AdminAccessInput }) => {
      if (kind === 'delete') return superAdminApi.remove(id);
      if (kind === 'restore') return superAdminApi.restore(id);
      if (kind === 'deactivate' || kind === 'reactivate')
        return superAdminApi.update(id, { isActive: kind === 'reactivate' });
      return superAdminApi.access(
        id,
        access ?? {
          action: kind === 'suspend' ? 'SUSPEND' : kind === 'revoke' ? 'REVOKE' : 'ACTIVATE',
        },
      );
    },
    onSuccess: async () => {
      const self = detail.data?.id;
      await invalidate();
      if (self) await cache.invalidateQueries({ queryKey: authenticatedUserQueryKey });
      setConfirm(null);
      toast({ title: 'Đã cập nhật quyền/tài khoản.', variant: 'success' });
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'destructive' }),
  });
  const access = useMutation({
    mutationFn: (input: AdminAccessInput) => superAdminApi.access(id, input),
    onSuccess: async () => {
      await invalidate();
      await cache.invalidateQueries({ queryKey: authenticatedUserQueryKey });
      toast({ title: 'Đã cập nhật quyền quản trị.', variant: 'success' });
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'destructive' }),
  });
  if (detail.isPending) return <p aria-live="polite">Đang tải người dùng…</p>;
  if (detail.isError) return <p role="alert">Không thể tải người dùng.</p>;
  const user = detail.data;
  const draft = values ?? profileOf(user);
  const entitlement = user.adminEntitlement;
  function saveProfile(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const errors: Partial<Record<ProfileField, string>> = {};
    if (!draft.fullName.trim()) errors.fullName = 'Họ tên là bắt buộc.';
    if (!/^\S+@\S+\.\S+$/u.test(draft.email)) errors.email = 'Email không hợp lệ.';
    if (draft.phone.trim().length < 6) errors.phone = 'Số điện thoại phải có ít nhất 6 ký tự.';
    if (!/^[a-zA-Z0-9._-]{1,100}$/u.test(draft.username))
      errors.username = 'Tên đăng nhập không hợp lệ.';
    setFieldErrors(errors);
    if (!Object.keys(errors).length) profile.mutate(draft);
  }
  function submitAccess(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const activeFrom = d.get('activeFrom');
    const activeUntil = d.get('activeUntil');
    if (typeof activeFrom !== 'string' || typeof activeUntil !== 'string') return;
    const limit = Number(d.get('tournamentLimit'));
    if (
      !activeFrom ||
      !activeUntil ||
      new Date(activeUntil) <= new Date(activeFrom) ||
      !Number.isInteger(limit) ||
      limit < 0
    ) {
      toast({
        title: 'Ngày hết hạn phải sau ngày bắt đầu và giới hạn phải là số nguyên không âm.',
        variant: 'destructive',
      });
      return;
    }
    const payload: AdminAccessInput = {
      action: entitlement?.status === 'ACTIVE' ? 'ADJUST' : 'ACTIVATE',
      activeFrom: localDateTimeInputToIso(activeFrom) ?? '',
      activeUntil: localDateTimeInputToIso(activeUntil) ?? '',
      tournamentLimit: limit,
    };
    if (!payload.activeFrom || !payload.activeUntil) return;
    if (entitlement?.status === 'REVOKED') {
      setPendingActivation(payload);
      setConfirm('reactivateEntitlement');
    } else access.mutate(payload);
  }
  const busy = profile.isPending || action.isPending || access.isPending;
  const confirmCopy: Record<Exclude<ConfirmAction, null>, [string, string, string]> = {
    deactivate: [
      'Tạm khóa tài khoản',
      `Người dùng ${user.username} sẽ không thể đăng nhập.`,
      'Tạm khóa',
    ],
    reactivate: [
      'Kích hoạt lại tài khoản',
      `Cho phép ${user.username} đăng nhập lại.`,
      'Kích hoạt lại',
    ],
    delete: [
      'Xóa mềm người dùng',
      `Xóa ${user.username}: đăng nhập dừng ngay; dữ liệu và lịch sử sở hữu vẫn được lưu.`,
      'Xóa người dùng',
    ],
    restore: [
      'Khôi phục người dùng',
      `Khôi phục ${user.username}; tài khoản vẫn cần được kích hoạt riêng.`,
      'Khôi phục',
    ],
    suspend: [
      'Đình chỉ quyền quản trị',
      'Người dùng mất quyền thay đổi dữ liệu, nhưng hồ sơ và dữ liệu được giữ trong cửa sổ chỉ đọc 12 tháng.',
      'Đình chỉ',
    ],
    resume: [
      'Tiếp tục quyền ADMIN',
      'Khôi phục quyền quản trị khi thời hạn còn hợp lệ.',
      'Khôi phục quyền',
    ],
    revoke: [
      'Thu hồi quyền quản trị',
      'Hạ về USER; quyền thay đổi dữ liệu bị mất, dữ liệu vẫn được giữ chỉ đọc 12 tháng.',
      'Thu hồi quyền',
    ],
    reactivateEntitlement: [
      'Kích hoạt lại quyền ADMIN',
      'Xác nhận cấp lại quyền ADMIN với thời hạn và giới hạn giải đấu đã nhập.',
      'Kích hoạt lại',
    ],
  };
  return (
    <section className="mx-auto w-full max-w-5xl" aria-busy={busy}>
      <Link className="text-primary underline" to="/super-admin/users">
        ← Danh sách người dùng
      </Link>
      <h1 className="mt-4 text-3xl font-black">{user.username}</h1>
      <p className="mt-1 text-muted-foreground">
        Tạo lúc {formatDateTime(user.createdAt)} ·{' '}
        {user.deletedAt ? 'Đã xóa mềm' : user.isActive ? 'Đang hoạt động' : 'Tạm khóa'}
      </p>
      <Card title="Hồ sơ và trạng thái tài khoản">
        <form onSubmit={saveProfile} noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <label key={field}>
                {labels[field]}
                <DateTimeInput
                  className="mt-1 w-full rounded border p-2"
                  disabled={!editing || busy}
                  value={draft[field]}
                  type={field === 'email' ? 'email' : 'text'}
                  onChange={(e) => {
                    setValues({ ...draft, [field]: e.target.value });
                    setFieldErrors({ ...fieldErrors, [field]: undefined });
                  }}
                />
                {fieldErrors[field] ? (
                  <span className="text-sm text-destructive" role="alert">
                    {fieldErrors[field]}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {editing ? (
              <>
                <Button disabled={busy} type="submit">
                  Lưu
                </Button>
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setValues(null);
                    setFieldErrors({});
                  }}
                >
                  Hủy
                </Button>
              </>
            ) : (
              <Button
                disabled={busy || Boolean(user.deletedAt)}
                type="button"
                onClick={() => {
                  setValues(profileOf(user));
                  setEditing(true);
                }}
              >
                Chỉnh sửa
              </Button>
            )}{' '}
            {!user.deletedAt ? (
              <Button
                disabled={busy}
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirm(user.isActive ? 'deactivate' : 'reactivate');
                }}
              >
                {user.isActive ? 'Tạm khóa' : 'Kích hoạt lại'}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
      <Card title="Vai trò và quyền quản trị">
        <p className="text-sm text-muted-foreground">
          Vai trò: <strong>{user.role}</strong>. Thay đổi quyền chỉ có hiệu lực sau khi bạn lưu biểu
          mẫu.
        </p>
        {user.role === 'SUPER_ADMIN' ? (
          <p className="mt-3" role="status">
            Siêu quản trị viên không thể thay đổi entitlement tại đây.
          </p>
        ) : (
          <>
            <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={submitAccess}>
              <label>
                Bắt đầu
                <input
                  className="mt-1 w-full rounded border p-2"
                  defaultValue={toLocalDateTimeInput(entitlement?.activeFrom)}
                  name="activeFrom"
                  required
                />
              </label>
              <label>
                Hết hạn
                <DateTimeInput
                  className="mt-1 w-full rounded border p-2"
                  defaultValue={toLocalDateTimeInput(entitlement?.activeUntil)}
                  name="activeUntil"
                  required
                />
              </label>
              <label>
                Giới hạn giải đấu
                <input
                  className="mt-1 w-full rounded border p-2"
                  defaultValue={entitlement?.tournamentLimit ?? ''}
                  min="0"
                  name="tournamentLimit"
                  required
                  type="number"
                />
              </label>
              <div className="md:col-span-3">
                <Button disabled={busy || Boolean(user.deletedAt)} type="submit">
                  {entitlement?.status === 'ACTIVE'
                    ? 'Lưu thời hạn và giới hạn'
                    : entitlement?.status === 'SUSPENDED'
                      ? 'Tiếp tục quyền ADMIN'
                      : entitlement?.status === 'EXPIRED'
                        ? 'Kích hoạt lại quyền ADMIN'
                        : entitlement?.status === 'REVOKED'
                          ? 'Kích hoạt lại quyền ADMIN'
                          : 'Kích hoạt quyền ADMIN'}
                </Button>
              </div>
            </form>
            {entitlement?.status === 'ACTIVE' || entitlement?.status === 'SUSPENDED' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={busy || Boolean(user.deletedAt)}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirm(entitlement.status === 'SUSPENDED' ? 'resume' : 'suspend');
                  }}
                >
                  {entitlement.status === 'SUSPENDED' ? 'Tiếp tục quyền' : 'Đình chỉ'}
                </Button>
                <Button
                  disabled={busy || Boolean(user.deletedAt)}
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setConfirm('revoke');
                  }}
                >
                  Thu hồi / hạ USER
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      <Card title="Lịch sử đơn đăng ký">
        {user.subscriptionOrders?.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Thời hạn</th>
                <th>Sức chứa</th>
                <th>Thành tiền</th>
                <th>Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {user.subscriptionOrders.map((o) => (
                <tr className="border-t" key={o.id}>
                  <td>{formatDateTime(o.createdAt)}</td>
                  <td>{o.durationMonthsGranted} tháng</td>
                  <td>{o.tournamentLimitGranted} giải</td>
                  <td>{money(o.totalAmountVnd)}</td>
                  <td>
                    {o.paymentStatus === 'SIMULATED_SUCCESS'
                      ? 'Mô phỏng thành công'
                      : o.paymentStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Chưa có đơn đăng ký.</p>
        )}
      </Card>
      <Card title="Giải đấu sở hữu và lưu giữ">
        {user.ownedTournaments?.length ? (
          <ul className="space-y-3">
            {user.ownedTournaments.map((t) => (
              <li className="rounded border p-3" key={t.id}>
                <Link
                  className="font-semibold text-primary underline"
                  to={`/admin/tournaments/${t.id}`}
                >
                  {t.name}
                </Link>{' '}
                · {t.softDeletedAt ? 'Đã xóa mềm' : 'Đang hoạt động'}
                <div className="text-sm text-muted-foreground">
                  Trạng thái: {t.status}; hạn xóa: {formatDate(t.purgeAfter)}; lý do:{' '}
                  {t.deletionReason ?? '—'}; khôi phục: {formatDate(t.restoredAt)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>Chưa sở hữu giải đấu nào.</p>
        )}
      </Card>
      <Card title="Vùng nguy hiểm">
        <p className="text-sm text-muted-foreground">
          Xóa mềm dừng đăng nhập tức thì. Dữ liệu và lịch sử vẫn được lưu theo chính sách lưu giữ.
        </p>
        <div className="mt-3">
          {user.deletedAt ? (
            <Button
              disabled={busy}
              type="button"
              onClick={() => {
                setConfirm('restore');
              }}
            >
              Khôi phục người dùng
            </Button>
          ) : (
            <Button
              disabled={busy || user.role === 'SUPER_ADMIN'}
              type="button"
              variant="destructive"
              onClick={() => {
                setConfirm('delete');
              }}
            >
              Xóa mềm người dùng
            </Button>
          )}
        </div>
      </Card>
      {confirm ? (
        <ConfirmationDialog
          actionLabel={confirmCopy[confirm][2]}
          busy={action.isPending}
          description={confirmCopy[confirm][1]}
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            if (confirm === 'suspend')
              action.mutate({ kind: confirm, access: { action: 'SUSPEND' } });
            else if (confirm === 'revoke')
              action.mutate({ kind: confirm, access: { action: 'REVOKE' } });
            else if (confirm === 'resume' && entitlement)
              action.mutate({
                kind: confirm,
                access: {
                  action: 'ACTIVATE',
                  activeFrom: entitlement.activeFrom,
                  activeUntil: entitlement.activeUntil,
                  tournamentLimit: entitlement.tournamentLimit,
                },
              });
            else if (confirm === 'reactivateEntitlement' && pendingActivation)
              action.mutate({ kind: confirm, access: pendingActivation });
            else action.mutate({ kind: confirm });
          }}
          title={confirmCopy[confirm][0]}
          warning={
            confirm === 'delete' || confirm === 'revoke'
              ? 'Hành động này thay đổi ngay quyền truy cập.'
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
function Card({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
