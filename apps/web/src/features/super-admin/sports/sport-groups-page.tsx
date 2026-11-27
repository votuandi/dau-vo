import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { superAdminSportGroupsQueryOptions } from './query-options';

export function SuperAdminSportGroupsPage() {
  const groups = useQuery(superAdminSportGroupsQueryOptions);
  return (
    <section aria-busy={groups.isFetching}>
      <h1 className="text-3xl font-black tracking-tight">Nhóm môn thể thao</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nhóm môn thể thao và các quy tắc liên quan được hệ thống quản lý, chỉ dùng để tham khảo.
      </p>
      {groups.isPending ? (
        <p aria-live="polite" className="mt-6 text-sm text-muted-foreground">
          Đang tải nhóm môn thể thao…
        </p>
      ) : null}
      {groups.isError ? (
        <Alert className="mt-6" role="alert" tone="error">
          Không thể tải nhóm môn thể thao.{' '}
          <Button onClick={() => void groups.refetch()} size="sm" type="button" variant="outline">
            Thử lại
          </Button>
        </Alert>
      ) : null}
      {groups.data ? (
        <>
          <div className="app-table-wrap mt-6">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-foreground/[0.08] bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã</th>
                  <th className="px-4 py-3 font-medium">Tên</th>
                  <th className="px-4 py-3 font-medium">Số môn thể thao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {groups.data.map((group) => (
                  <tr className="transition-colors hover:bg-sky-50/40" key={group.id}>
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                      {group.code}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-foreground">{group.name}</td>
                    <td className="px-4 py-3.5">
                      <Badge tone="primary">{group.sportCount} môn</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groups.data.length === 0 ? (
            <p
              className="app-card mt-6 border-dashed p-8 text-center text-sm text-muted-foreground"
              role="status"
            >
              Không có nhóm môn thể thao.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
