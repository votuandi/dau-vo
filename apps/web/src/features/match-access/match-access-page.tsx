import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, LogOut, Radio, ShieldAlert } from 'lucide-react';
import {
  MatchRole,
  type MatchAccessConflict,
  type MatchSessionView,
} from '@dau-vo/shared-types';
import { matchAccessApi } from '@/services/api/endpoints';
import { ApiClientError } from '@/services/api/client';
import { queryKeys } from '@/services/api/query-keys';
import { normalizePublicId } from '@/lib/utils';
import { errorMessages, roleLabels } from '@/i18n/vi';
import { useClientSessionStore } from '@/stores/client-session-store';
import { RealtimeMatchProvider } from '@/features/realtime/realtime-match-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PageError, PageLoading } from '@/components/page-state';

type AccessSurface = 'REFEREE' | 'INSPECTOR';

interface MatchAccessPageProps {
  surface: AccessSurface;
  children: ReactNode;
}

function roleMatchesSurface(role: MatchRole, surface: AccessSurface): boolean {
  return surface === 'INSPECTOR'
    ? role === MatchRole.INSPECTOR
    : role === MatchRole.REFEREE_1 ||
        role === MatchRole.REFEREE_2 ||
        role === MatchRole.REFEREE_3;
}

export function MatchAccessPage({ surface, children }: MatchAccessPageProps) {
  const session = useClientSessionStore((state) => state.matchSession);
  const deviceId = useClientSessionStore((state) => state.deviceId);
  const lastMatchPublicId = useClientSessionStore((state) => state.lastMatchPublicId);
  const revokedReason = useClientSessionStore((state) => state.revokedReason);
  const setSession = useClientSessionStore((state) => state.setMatchSession);
  const clearSession = useClientSessionStore((state) => state.clearMatchSession);
  const clearRevokedReason = useClientSessionStore((state) => state.clearRevokedReason);
  const [publicId, setPublicId] = useState(lastMatchPublicId);
  const [code, setCode] = useState('');
  const [takeoverTicket, setTakeoverTicket] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: queryKeys.matchSession,
    queryFn: ({ signal }) => matchAccessApi.session(signal),
    enabled: Boolean(session),
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.data) setSession(sessionQuery.data);
  }, [sessionQuery.data, setSession]);

  useEffect(() => {
    if (
      sessionQuery.error instanceof ApiClientError &&
      (sessionQuery.error.status === 401 || sessionQuery.error.body.code === 'SESSION_REVOKED')
    ) {
      clearSession(errorMessages[sessionQuery.error.body.code]);
    }
  }, [clearSession, sessionQuery.error]);

  const login = useMutation({
    mutationFn: () =>
      matchAccessApi.login({
        matchPublicId: publicId,
        securityCode: code,
        deviceId,
      }),
    onSuccess: (result) => {
      if ('canTakeOver' in result) {
        setTakeoverTicket(result.takeoverTicket);
        return;
      }
      acceptSession(result);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        const details = error.body.details;
        const conflict = error.body as typeof error.body & Partial<MatchAccessConflict>;
        const ticket =
          typeof conflict.takeoverTicket === 'string'
            ? conflict.takeoverTicket
            : typeof details?.takeoverTicket === 'string'
              ? details.takeoverTicket
              : null;
        if (error.body.code === 'SESSION_ALREADY_ACTIVE' && ticket) {
          setTakeoverTicket(ticket);
          return;
        }
        setFormError(errorMessages[error.body.code]);
      } else setFormError('Không thể kết nối máy chủ. Vui lòng thử lại.');
    },
  });
  const takeover = useMutation({
    mutationFn: (ticket: string) =>
      matchAccessApi.takeover({ takeoverTicket: ticket, deviceId }),
    onSuccess: acceptSession,
    onError: (error) => {
      setTakeoverTicket(null);
      setFormError(
        error instanceof ApiClientError
          ? errorMessages[error.body.code]
          : 'Không thể chuyển phiên đăng nhập.',
      );
    },
  });
  const logout = useMutation({
    mutationFn: matchAccessApi.logout,
    onSettled: () => clearSession(),
  });

  function acceptSession(value: MatchSessionView) {
    setCode('');
    setFormError(null);
    setTakeoverTicket(null);
    if (!roleMatchesSurface(value.role, surface)) {
      clearSession();
      setFormError(
        surface === 'REFEREE'
          ? 'Mã này không thuộc vai trò trọng tài.'
          : 'Mã này không thuộc vai trò giám định viên.',
      );
      void matchAccessApi.logout().catch(() => undefined);
      return;
    }
    setSession(value);
  }

  if (session && sessionQuery.isPending) return <PageLoading label="Đang khôi phục phiên thi đấu…" />;
  if (session && sessionQuery.isError && !(sessionQuery.error instanceof ApiClientError && sessionQuery.error.status === 401)) {
    return (
      <PageError
        message="Không thể xác minh phiên khi đang mất kết nối. Hệ thống chưa cho phép thao tác."
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }
  if (session && roleMatchesSurface(session.role, surface)) {
    return (
      <RealtimeMatchProvider audience="MATCH_SESSION" publicMatchId={session.matchPublicId}>
        <div className="relative">
          <Button
            aria-label="Đăng xuất phiên thi đấu"
            className="fixed right-3 top-3 z-40 bg-black/20 text-white hover:bg-black/40"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
            size="icon"
            variant="ghost"
          >
            <LogOut className="h-4 w-4" />
          </Button>
          {children}
        </div>
      </RealtimeMatchProvider>
    );
  }

  const title = surface === 'REFEREE' ? 'Trọng tài' : 'Giám định viên';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (publicId && code) login.mutate();
  };

  return (
    <main className="match-login-background grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md border-white/10 bg-slate-950/90 text-white shadow-2xl backdrop-blur">
        <CardHeader className="pb-3 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-amber-400 text-slate-950">
            {surface === 'REFEREE' ? <Radio className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
          </div>
          <CardTitle className="text-2xl">Đăng nhập {title}</CardTitle>
          <CardDescription className="text-slate-400">Nhập mã trận đấu và mã bảo mật được cấp.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <Field
              autoCapitalize="characters"
              autoComplete="off"
              label="Mã trận đấu"
              name="matchPublicId"
              onChange={(event) => setPublicId(normalizePublicId(event.target.value))}
              placeholder="A72K9P"
              required
              value={publicId}
            />
            <Field
              autoComplete="off"
              inputMode="numeric"
              label="Mã bảo mật"
              maxLength={12}
              name="securityCode"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              required
              type="password"
              value={code}
            />
            {formError || revokedReason ? (
              <p className="rounded-lg bg-red-950/70 p-3 text-sm text-red-100" role="alert">
                {formError ?? revokedReason}
              </p>
            ) : null}
            <Button
              className="mt-2 w-full"
              disabled={login.isPending || !publicId || !code}
              onClick={clearRevokedReason}
              size="lg"
              type="submit"
            >
              <KeyRound className="h-4 w-4" /> {login.isPending ? 'Đang xác minh…' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        dismissible={!takeover.isPending}
        onClose={() => setTakeoverTicket(null)}
        open={Boolean(takeoverTicket)}
        title="Phiên đang được sử dụng"
        description="Mã này đang được sử dụng trên một thiết bị hoặc trình duyệt khác. Bạn có muốn tiếp tục trên thiết bị này không?"
      >
        <div className="flex justify-end gap-3">
          <Button disabled={takeover.isPending} onClick={() => setTakeoverTicket(null)} variant="outline">Không</Button>
          <Button
            disabled={takeover.isPending}
            onClick={() => takeoverTicket && takeover.mutate(takeoverTicket)}
            variant="destructive"
          >
            {takeover.isPending ? 'Đang chuyển phiên…' : 'Tiếp tục trên thiết bị này'}
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
