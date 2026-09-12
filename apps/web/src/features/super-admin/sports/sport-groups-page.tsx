import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { superAdminSportGroupsQueryOptions } from './query-options';

export function SuperAdminSportGroupsPage() {
  const groups = useQuery(superAdminSportGroupsQueryOptions);
  return (
    <section aria-busy={groups.isFetching}>
      <h1 className="text-3xl font-black">Nhóm môn thể thao</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nhóm môn thể thao và các quy tắc liên quan được hệ thống quản lý, chỉ dùng để tham khảo.
      </p>
      {groups.isPending ? (
        <p aria-live="polite" className="mt-6">
          Đang tải nhóm môn thể thao…
        </p>
      ) : null}
      {groups.isError ? (
        <div className="mt-6 rounded border border-destructive p-4" role="alert">
          Không thể tải nhóm môn thể thao.{' '}
          <Button onClick={() => void groups.refetch()} size="sm" type="button" variant="outline">
            Thử lại
          </Button>
        </div>
      ) : null}
      {groups.data ? (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3">Mã</th>
                  <th className="p-3">Tên</th>
                  <th className="p-3">Số môn thể thao</th>
                </tr>
              </thead>
              <tbody>
                {groups.data.map((group) => (
                  <tr className="border-t" key={group.id}>
                    <td className="p-3">{group.code}</td>
                    <td className="p-3 font-semibold">{group.name}</td>
                    <td className="p-3">{group.sportCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groups.data.length === 0 ? (
            <p className="mt-6 rounded border p-5" role="status">
              Không có nhóm môn thể thao.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
