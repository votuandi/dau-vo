import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, KeyRound, Link, Pencil, Plus, Search, Wifi, WifiOff, Zap } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

const labels = { JUDGE: 'Giám định', SUPERVISOR: 'Giám sát' } as const;
function errorText(error: unknown) {
  const message = getApiErrorMessage(error, 'Không thể thực hiện yêu cầu.');
  if (message.includes('OFFICIAL_IN_ACTIVE_MATCH'))
    return 'Không thể thay đổi vì cán bộ đang được phân công trận đấu.';
  if (message.includes('OFFICIAL_COUNT_BELOW_STAFFING_REQUIREMENT'))
    return 'Không thể ngừng dùng vì không đủ giám định cho nhánh đấu.';
  return message;
}
function Status({ official }: { readonly official: TournamentOfficial }) {
  const tone =
    official.status === 'READY'
      ? 'success'
      : official.status === 'IN_MATCH'
        ? 'warning'
        : 'neutral';
  const text =
    official.status === 'READY'
      ? 'Sẵn sàng'
      : official.status === 'IN_MATCH'
        ? 'Đang trong trận'
        : 'Chưa sẵn sàng';
  return (
    <div className="flex flex-wrap gap-2">
      <Badge dot tone={tone}>
        {text}
      </Badge>
      <Badge tone={official.connected ? 'primary' : 'neutral'}>
        {official.connected ? (
          <Wifi aria-hidden="true" className="size-3" />
        ) : (
          <WifiOff aria-hidden="true" className="size-3" />
        )}
        {official.connected ? 'Đang kết nối' : 'Ngoại tuyến'}
      </Badge>
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
  const [loginLink, setLoginLink] = useState<{ url: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TournamentOfficial | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<{
    official: TournamentOfficial;
    regenerate: boolean;
  } | null>(null);
  const [passcode, setPasscode] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [quickCredentials, setQuickCredentials] = useState<{ name: string; passcode: string }[]>(
    [],
  );
  const [quickError, setQuickError] = useState<string | null>(null);
  const quantityInput = useRef<HTMLInputElement>(null);
  const validQuantity = Number.isSafeInteger(Number(quantity)) && Number(quantity) > 0;
  const input = useRef<HTMLInputElement>(null);
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: tournamentQueryKeys.officials(tournamentId, role),
    });
  useEffect(() => {
    setLoginLink(null);
    setEditing(null);
    setName('');
    setPasscode(null);
    setQuickOpen(false);
    setQuickCredentials([]);
    setQuickError(null);
  }, [role, tournamentId]);
  const quickAdd = useMutation({
    mutationFn: async (count: number) => {
      const latest = await adminManagementApi.listOfficials(tournamentId, { role });
      const names = new Set(latest.officials.map((official) => official.name));
      let next = 1;
      for (let index = 0; index < count; index += 1) {
        let generatedName = `${labels[role]} ${String(next).padStart(3, '0')}`;
        while (names.has(generatedName)) {
          next += 1;
          generatedName = `${labels[role]} ${String(next).padStart(3, '0')}`;
        }
        const data = await adminManagementApi.createOfficial(tournamentId, {
          role,
          name: generatedName,
        });
        names.add(generatedName);
        next += 1;
        setQuickCredentials((previous) => [
          ...previous,
          { name: generatedName, passcode: data.passcode },
        ]);
      }
    },
    onSuccess: () => {
      notifyMutationSuccess('Đã thêm nhanh cán bộ.');
    },
    onError: (error) => {
      setQuickError(errorText(error));
    },
    onSettled: invalidate,
  });
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
  const createLink = useMutation({
    mutationFn: (official: TournamentOfficial) =>
      adminManagementApi.createOfficialLoginLink(tournamentId, official.id),
    onSuccess: (data, official) => {
      const path = data.role === TournamentOfficialRole.JUDGE ? '/giam-dinh' : '/giam-sat';
      const url = new URL(path, window.location.origin);
      url.hash = new URLSearchParams({ token: data.token }).toString();
      setLoginLink({ url: url.toString(), name: official.name });
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
          <h2 className="flex items-center gap-2 text-xl font-black">
            {labels[role]}
            {query.isSuccess ? <Badge tone="primary">{query.data.officials.length}</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">Quản lý cán bộ của giải đấu.</p>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={query.isPending || query.isError || save.isPending || quickAdd.isPending}
              onClick={() => {
                setQuantity('1');
                setQuickCredentials([]);
                setQuickError(null);
                setQuickOpen(true);
              }}
              type="button"
              variant="outline"
            >
              <Zap aria-hidden="true" className="size-4" />
              Thêm nhanh
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setName('');
              }}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
              Thêm {labels[role].toLocaleLowerCase('vi')}
            </Button>
          </div>
        ) : null}
      </div>
      <label className="relative block max-w-md text-sm font-semibold">
        Tìm kiếm
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3.5 left-3 size-4 text-muted-foreground"
        />
        <input
          className={`${inputClassName} mt-1 pl-9`}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          value={search}
        />
      </label>
      {!readOnly ? (
        <form
          className="grid items-end gap-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]"
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
        <Alert role="alert" tone="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {getApiErrorMessage(query.error, 'Không thể tải danh sách.')}
            <Button
              onClick={() => {
                void query.refetch();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Thử lại
            </Button>
          </div>
        </Alert>
      ) : null}
      {query.isSuccess && visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Chưa có {labels[role].toLocaleLowerCase('vi')}.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {visible.map((official) => (
          <li
            className="rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-md"
            key={official.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                    aria-label="Tạo link đăng nhập"
                    disabled={
                      !official.isActive ||
                      createLink.isPending ||
                      state.isPending ||
                      regenerate.isPending
                    }
                    onClick={() => {
                      createLink.mutate(official);
                    }}
                    size="sm"
                    title="Tạo link đăng nhập"
                    type="button"
                    variant="soft"
                  >
                    <Link aria-hidden="true" className="size-4" />
                    Link đăng nhập
                  </Button>
                  <Button
                    aria-label="Tạo mã mới"
                    disabled={state.isPending || regenerate.isPending}
                    onClick={() => {
                      setConfirm({ official, regenerate: true });
                    }}
                    size="icon-sm"
                    title="Tạo mã mới"
                    type="button"
                    variant="outline"
                  >
                    <KeyRound aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    aria-label="Sửa"
                    disabled={save.isPending || state.isPending || regenerate.isPending}
                    onClick={() => {
                      setEditing(official);
                      setName(official.name);
                    }}
                    size="icon-sm"
                    title="Sửa"
                    type="button"
                    variant="outline"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    aria-label={official.isActive ? 'Ngừng dùng' : 'Kích hoạt'}
                    disabled={state.isPending || regenerate.isPending}
                    onClick={() => {
                      setConfirm({ official, regenerate: false });
                    }}
                    size="icon-sm"
                    title={official.isActive ? 'Đình chỉ' : 'Kích hoạt'}
                    type="button"
                    variant={official.isActive ? 'warning-soft' : 'success-soft'}
                  >
                    {official.isActive ? (
                      <Ban aria-hidden="true" className="size-4" />
                    ) : (
                      <Check aria-hidden="true" className="size-4" />
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {quickOpen ? (
        <Dialog
          title={`Thêm nhanh ${labels[role].toLocaleLowerCase('vi')}`}
          description={
            quickCredentials.length
              ? 'Hãy sao chép và lưu các mã bảo mật riêng; các mã này sẽ không hiển thị lại.'
              : `Nhập số lượng ${labels[role].toLocaleLowerCase('vi')} muốn thêm. Tên tự động có dạng ${labels[role]} 001, ${labels[role]} 002,…`
          }
          initialFocusRef={quantityInput}
          pending={quickAdd.isPending}
          onClose={() => {
            setQuickOpen(false);
          }}
        >
          {quickCredentials.length === 0 ? (
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (validQuantity && !quickAdd.isPending) {
                  setQuickError(null);
                  quickAdd.mutate(Number(quantity));
                }
              }}
            >
              <label className="block text-sm font-semibold">
                Số lượng
                <input
                  className={`${inputClassName} mt-1`}
                  ref={quantityInput}
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={quantity}
                  disabled={quickAdd.isPending}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                  }}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={quickAdd.isPending}
                  onClick={() => {
                    setQuickOpen(false);
                  }}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={!validQuantity || quickAdd.isPending}>
                  {quickAdd.isPending ? 'Đang thêm…' : 'Thêm'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm">
                Đã thêm {quickCredentials.length} / {quantity}{' '}
                {labels[role].toLocaleLowerCase('vi')}
                {quickAdd.isPending ? ' — đang thêm…' : '.'}
              </p>
              {tournamentPublicCode ? (
                <p className="text-sm">
                  Mã giải đấu: <strong>{tournamentPublicCode}</strong>
                </p>
              ) : null}
              <ClipboardCopyButton
                accessibleLabel="Sao chép tất cả mã"
                value={[
                  ...(tournamentPublicCode ? [`Mã giải đấu: ${tournamentPublicCode}`] : []),
                  ...quickCredentials.map(
                    (credential) => `${credential.name}: ${credential.passcode}`,
                  ),
                ].join('\n')}
              />
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {quickCredentials.map((credential) => (
                  <li
                    key={credential.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5"
                  >
                    <span>{credential.name}</span>
                    <code className="select-all font-bold">{credential.passcode}</code>
                    <ClipboardCopyButton
                      accessibleLabel={`Sao chép mã ${credential.name}`}
                      value={credential.passcode}
                    />
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={quickAdd.isPending}
                  onClick={() => {
                    setQuickOpen(false);
                  }}
                >
                  Đã lưu mã
                </Button>
              </div>
            </div>
          )}
          {quickError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {quickError}
            </p>
          ) : null}
        </Dialog>
      ) : null}
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
      {loginLink ? (
        <Dialog
          showCloseButton
          title={`Link đăng nhập — ${loginLink.name}`}
          description="Link có hiệu lực trong 7 ngày. Tạo mã bảo mật mới sẽ vô hiệu hóa link này."
          onClose={() => {
            setLoginLink(null);
          }}
        >
          <div className="mt-4 flex items-center gap-2">
            <input
              aria-label="Link đăng nhập"
              className={`${inputClassName} min-w-0 flex-1`}
              readOnly
              value={loginLink.url}
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <ClipboardCopyButton
              accessibleLabel="Sao chép link đăng nhập"
              className="mt-1.5 h-11"
              value={loginLink.url}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                setLoginLink(null);
              }}
              type="button"
            >
              Đóng
            </Button>
          </div>
        </Dialog>
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
                  <code className="select-all rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 font-mono font-bold uppercase tracking-wider text-primary">
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
                <code className="select-all rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 font-mono font-bold tracking-wider text-primary">
                  {passcode}
                </code>
                <ClipboardCopyButton accessibleLabel="Sao chép mã bảo mật riêng" value={passcode} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
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
