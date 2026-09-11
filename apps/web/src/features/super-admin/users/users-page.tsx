/* eslint-disable @typescript-eslint/no-confusing-void-expression, react-hooks/exhaustive-deps */
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/admin-management/presentation';
import {
  superAdminApi,
  type ActiveStatus,
  type DeletedStatus,
  type EntitlementStatus,
  type ListSuperAdminUsersInput,
  type Role,
} from '@/services/api/super-admin';
import { superAdminUserKeys } from './query-keys';

const roles: readonly Role[] = ['USER', 'ADMIN', 'SUPER_ADMIN'];
const active: readonly ActiveStatus[] = ['ACTIVE', 'INACTIVE'];
const entitlement: readonly EntitlementStatus[] = [
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED',
  'NONE',
];
const deleted: readonly DeletedStatus[] = ['EXCLUDE', 'ONLY', 'INCLUDE'];
function enumValue<T extends string>(value: string | null, values: readonly T[]): T | undefined {
  return value !== null && values.includes(value as T) ? (value as T) : undefined;
}
function positive(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function label(user: { isActive: boolean; deletedAt: string | null }): string {
  return user.deletedAt ? 'Đã xóa' : user.isActive ? 'Hoạt động' : 'Tạm khóa';
}

export function SuperAdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const [searchText, setSearchText] = useState(search);
  const role = enumValue(params.get('role'), roles),
    activeStatus = enumValue(params.get('activeStatus'), active),
    entitlementStatus = enumValue(params.get('entitlementStatus'), entitlement),
    deletedStatus = enumValue(params.get('deletedStatus'), deleted);
  const input: ListSuperAdminUsersInput = {
    page: positive(params.get('page'), 1),
    pageSize: positive(params.get('pageSize'), 25),
    ...(search ? { search } : {}),
    ...(role ? { role } : {}),
    ...(activeStatus ? { activeStatus } : {}),
    ...(entitlementStatus ? { entitlementStatus } : {}),
    ...(deletedStatus ? { deletedStatus } : {}),
  };
  useEffect(() => setSearchText(search), [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchText !== search) update({ search: searchText, page: '1' });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchText, search]);
  const users = useQuery({
    queryKey: superAdminUserKeys.list(input),
    queryFn: () => superAdminApi.users(input),
  });
  function update(changes: Record<string, string>): void {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      return next;
    });
  }
  function select(name: string, value: string): void {
    update({ [name]: value, page: '1' });
  }
  return (
    <section className="w-full" aria-busy={users.isFetching}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Người dùng</h1>
          <p className="mt-1 text-sm text-muted-foreground">Quản lý thư mục tài khoản hệ thống.</p>
        </div>
        <Button asChild>
          <Link to="/super-admin/users/new">Thêm người dùng</Link>
        </Button>
      </div>
      <div className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="md:col-span-2 xl:col-span-1">
          Tìm kiếm
          <input
            aria-label="Tìm kiếm người dùng"
            className="mt-1 w-full rounded border p-2"
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tên, email, điện thoại"
            value={searchText}
          />
        </label>
        <Filter label="Vai trò" name="role" onChange={select} value={input.role} values={roles} />
        <Filter
          label="Tài khoản"
          name="activeStatus"
          onChange={select}
          value={input.activeStatus}
          values={active}
        />
        <Filter
          label="Quyền quản trị"
          name="entitlementStatus"
          onChange={select}
          value={input.entitlementStatus}
          values={entitlement}
        />
        <Filter
          label="Đã xóa"
          name="deletedStatus"
          onChange={select}
          value={input.deletedStatus}
          values={deleted}
        />
      </div>
      {users.isPending ? (
        <p aria-live="polite" className="mt-6">
          Đang tải người dùng…
        </p>
      ) : null}
      {users.isError ? (
        <div className="mt-6 rounded border border-destructive p-4" role="alert">
          Không thể tải người dùng.{' '}
          <Button onClick={() => void users.refetch()} size="sm" type="button" variant="outline">
            Thử lại
          </Button>
        </div>
      ) : null}
      {users.data ? (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {[
                    'Họ tên / tên đăng nhập',
                    'Email / điện thoại',
                    'Đơn vị',
                    'Vai trò',
                    'Tài khoản',
                    'Quyền quản trị',
                    'Ngày tạo',
                    '',
                  ].map((h) => (
                    <th className="p-3 font-semibold" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((user) => (
                  <tr className="border-t" key={user.id}>
                    <td className="p-3">
                      <strong>{user.fullName ?? '—'}</strong>
                      <br />
                      <span className="text-muted-foreground">{user.username}</span>
                    </td>
                    <td className="p-3">
                      {user.email ?? '—'}
                      <br />
                      <span className="text-muted-foreground">{user.phone ?? '—'}</span>
                    </td>
                    <td className="p-3">{user.organization ?? '—'}</td>
                    <td className="p-3">{user.role}</td>
                    <td className="p-3">{label(user)}</td>
                    <td className="p-3">
                      {user.adminEntitlement ? (
                        <>
                          {user.adminEntitlement.status}
                          <br />
                          <span className="text-muted-foreground">
                            đến {formatDate(user.adminEntitlement.activeUntil)}
                          </span>
                        </>
                      ) : (
                        'Không có'
                      )}
                    </td>
                    <td className="p-3">{formatDate(user.createdAt)}</td>
                    <td className="p-3">
                      <Link className="text-primary underline" to={`/super-admin/users/${user.id}`}>
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.data.items.length === 0 ? (
            <p className="mt-6 rounded border p-5" role="status">
              Không có người dùng phù hợp.
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-3">
            <Button
              disabled={input.page <= 1}
              onClick={() => update({ page: String(input.page - 1) })}
              type="button"
              variant="outline"
            >
              Trước
            </Button>
            <span aria-live="polite">
              Trang {users.data.page} / {Math.max(users.data.totalPages, 1)} · {users.data.total}{' '}
              người dùng
            </span>
            <Button
              disabled={users.data.page >= users.data.totalPages || users.data.totalPages === 0}
              onClick={() => update({ page: String(input.page + 1) })}
              type="button"
              variant="outline"
            >
              Sau
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
function Filter<T extends string>({
  label,
  name,
  value,
  values,
  onChange,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: T | undefined;
  readonly values: readonly T[];
  readonly onChange: (name: string, value: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        className="mt-1 w-full rounded border p-2"
        name={name}
        onChange={(e) => onChange(name, e.target.value)}
        value={value ?? ''}
      >
        <option value="">Tất cả</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}
