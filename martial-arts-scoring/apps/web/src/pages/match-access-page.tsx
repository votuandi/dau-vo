import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import type { SessionRevokedPayload } from '@martial-arts-scoring/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  getLastMatchPublicId,
  getOrCreateDeviceId,
  rememberMatchAccessSession,
} from '@/features/match-access/device';
import {
  getMatchAccessPath,
  matchAccessSessionQueryKey,
  matchAccessSessionQueryOptions,
} from '@/features/match-access/match-session';
import { useMatchRealtime } from '@/features/match-access/match-realtime';
import { InspectorConsole } from '@/features/match-access/inspector-console';
import { RefereeConsole } from '@/features/match-access/referee-console';
import {
  matchAccessApi,
  type MatchAccessSession,
  type MatchAccessSessionResponse,
} from '@/services/api/match-access';
import { ApiClientError } from '@/services/api/client';
import { connectSocket } from '@/services/socket/client';
import { MatchRole } from '@/types/shared';

interface MatchAccessPageProps {
  readonly expectedRole: MatchRole;
}

interface LoginFormErrors {
  readonly matchId?: string;
  readonly securityCode?: string;
}

interface TakeoverChallenge {
  readonly matchId: string;
  readonly securityCode: string;
  readonly deviceId: string;
  readonly takeoverToken: string;
}

const rolePresentation = {
  [MatchRole.REFEREE]: {
    eyebrow: 'Khu vực trọng tài',
    title: 'Đăng nhập trọng tài',
    description: 'Nhập mã trận đấu và mã bảo mật được ban tổ chức cấp.',
    accentClass: 'from-sky-700 via-blue-950 to-red-800',
    eyebrowClass: 'text-sky-700',
  },
  [MatchRole.INSPECTOR]: {
    eyebrow: 'Khu vực giám định',
    title: 'Đăng nhập giám định',
    description: 'Nhập mã trận đấu và mã bảo mật được ban tổ chức cấp.',
    accentClass: 'from-sky-700 via-blue-950 to-red-800',
    eyebrowClass: 'text-sky-700',
  },
} as const;

function validateLoginForm(matchId: string, securityCode: string): LoginFormErrors {
  const errors: { matchId?: string; securityCode?: string } = {};

  if (matchId.trim().length === 0) {
    errors.matchId = 'Vui lòng nhập mã trận đấu.';
  } else if (matchId.trim().length > 32) {
    errors.matchId = 'Mã trận đấu không được vượt quá 32 ký tự.';
  }

  if (securityCode.trim().length === 0) {
    errors.securityCode = 'Vui lòng nhập mã bảo mật.';
  } else if (securityCode.trim().length > 64) {
    errors.securityCode = 'Mã bảo mật không được vượt quá 64 ký tự.';
  }

  return errors;
}

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (
      error.body.code === 'INVALID_MATCH_ACCESS_CREDENTIALS' ||
      error.body.code === 'INVALID_MATCH_CREDENTIALS' ||
      error.body.code === 'INVALID_CREDENTIALS'
    ) {
      return 'Mã trận đấu hoặc mã bảo mật không đúng.';
    }

    if (error.body.code === 'INVALID_TAKEOVER') {
      return 'Yêu cầu tiếp quản không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.';
    }

    if (error.status === 429) {
      return error.body.message ?? 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.';
    }

    return error.body.message ?? 'Không thể đăng nhập. Vui lòng thử lại.';
  }

  return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
}

function getTakeoverToken(error: ApiClientError): string | null {
  const { takeoverToken } = error.body;
  return typeof takeoverToken === 'string' && takeoverToken.length > 0 ? takeoverToken : null;
}

function LoadingSession() {
  return (
    <section
      aria-live="polite"
      className="mx-auto w-full max-w-xl rounded-2xl border border-white/80 bg-card/90 p-8 text-center shadow-2xl shadow-blue-950/10 backdrop-blur"
    >
      <div className="mx-auto size-9 animate-pulse rounded-full bg-gradient-to-br from-sky-600 to-red-600 shadow-lg shadow-sky-700/20" />
      <h1 className="mt-5 text-xl font-bold">Đang kiểm tra phiên đăng nhập…</h1>
      <p className="mt-2 text-sm text-muted-foreground">Vui lòng chờ trong giây lát.</p>
    </section>
  );
}

interface AuthenticatedMatchAccessProps {
  readonly expectedRole: MatchRole;
  readonly isLogoutPending: boolean;
  readonly onAuthenticationRequired: () => void;
  readonly onLogout: () => void;
  readonly onSessionRevoked: (payload: SessionRevokedPayload) => void;
  readonly session: MatchAccessSession;
}

function AuthenticatedMatchAccess({
  expectedRole,
  isLogoutPending,
  onAuthenticationRequired,
  onLogout,
  onSessionRevoked,
  session,
}: AuthenticatedMatchAccessProps) {
  const realtime = useMatchRealtime({
    matchPublicId: session.matchPublicId,
    onAuthenticationRequired,
    onSessionRevoked,
    refereeSlot: session.refereeSlot,
  });

  if (expectedRole === MatchRole.REFEREE) {
    return (
      <RefereeConsole
        isLogoutPending={isLogoutPending}
        onLogout={() => {
          realtime.disconnect();
          onLogout();
        }}
        realtime={realtime}
        session={session}
      />
    );
  }

  return (
    <InspectorConsole
      isLogoutPending={isLogoutPending}
      onLogout={() => {
        realtime.disconnect();
        onLogout();
      }}
      realtime={realtime}
      session={session}
    />
  );
}

export function MatchAccessPage({ expectedRole }: MatchAccessPageProps) {
  const presentation = rolePresentation[expectedRole];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(matchAccessSessionQueryOptions);
  const [deviceId] = useState(getOrCreateDeviceId);
  const [matchId, setMatchId] = useState(getLastMatchPublicId);
  const [securityCode, setSecurityCode] = useState('');
  const [formErrors, setFormErrors] = useState<LoginFormErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [takeoverChallenge, setTakeoverChallenge] = useState<TakeoverChallenge | null>(null);
  const [sessionRevocationMessage, setSessionRevocationMessage] = useState<string | null>(null);

  const logoutMutation = useMutation({
    mutationFn: matchAccessApi.logout,
    onError: () => {
      connectSocket();
    },
    onSuccess: () => {
      queryClient.setQueryData(matchAccessSessionQueryKey, null);
    },
  });

  const handleSessionRevoked = useCallback(() => {
    setSessionRevocationMessage('Phiên đăng nhập của bạn đã được chuyển sang thiết bị khác.');
    queryClient.setQueryData(matchAccessSessionQueryKey, null);
  }, [queryClient]);

  const handleRealtimeAuthenticationRequired = useCallback(() => {
    setSessionRevocationMessage(
      'Phiên đăng nhập không còn hiệu lực hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    );
    queryClient.setQueryData(matchAccessSessionQueryKey, null);
  }, [queryClient]);

  useEffect(() => {
    const session = sessionQuery.data?.session;
    if (session) {
      setSecurityCode('');
      setTakeoverChallenge(null);
      setFormErrors({});
      setRequestError(null);
      rememberMatchAccessSession(session);
    }
  }, [sessionQuery.data]);

  function acceptSession(response: MatchAccessSessionResponse): void {
    setSecurityCode('');
    setTakeoverChallenge(null);
    setRequestError(null);
    setSessionRevocationMessage(null);
    rememberMatchAccessSession(response.session);
    queryClient.setQueryData(matchAccessSessionQueryKey, response);
    void navigate(getMatchAccessPath(response.session.role), { replace: true });
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedMatchId = matchId.trim().toUpperCase();
    const normalizedSecurityCode = securityCode.trim();
    const errors = validateLoginForm(normalizedMatchId, normalizedSecurityCode);
    setFormErrors(errors);
    setRequestError(null);

    if (errors.matchId || errors.securityCode) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await matchAccessApi.login({
        matchId: normalizedMatchId,
        securityCode: normalizedSecurityCode,
        deviceId,
      });
      acceptSession(response);
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 409 &&
        error.body.code === 'SESSION_ALREADY_ACTIVE' &&
        error.body.canTakeOver === true
      ) {
        const takeoverToken = getTakeoverToken(error);
        if (takeoverToken) {
          setTakeoverChallenge({
            matchId: normalizedMatchId,
            securityCode: normalizedSecurityCode,
            deviceId,
            takeoverToken,
          });
          setSecurityCode('');
          return;
        }
      }

      setSecurityCode('');
      setRequestError(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTakeover(): Promise<void> {
    if (!takeoverChallenge) {
      return;
    }

    setIsSubmitting(true);
    setRequestError(null);
    try {
      const response = await matchAccessApi.takeover(takeoverChallenge);
      acceptSession(response);
    } catch (error) {
      setTakeoverChallenge(null);
      setRequestError(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelTakeover(): void {
    setSecurityCode('');
    setTakeoverChallenge(null);
    setRequestError(null);
  }

  if (sessionQuery.isPending) {
    return <LoadingSession />;
  }

  const session = sessionQuery.data?.session;
  if (session && session.role !== expectedRole) {
    return <Navigate replace to={getMatchAccessPath(session.role)} />;
  }

  if (session) {
    return (
      <AuthenticatedMatchAccess
        expectedRole={expectedRole}
        isLogoutPending={logoutMutation.isPending}
        onAuthenticationRequired={handleRealtimeAuthenticationRequired}
        onLogout={() => {
          logoutMutation.mutate();
        }}
        onSessionRevoked={handleSessionRevoked}
        session={session}
      />
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/80 bg-card/90 shadow-2xl shadow-blue-950/10 backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
      <div
        className={`relative hidden overflow-hidden bg-gradient-to-br ${presentation.accentClass} p-10 text-white md:flex md:flex-col md:justify-between`}
      >
        <span
          aria-hidden="true"
          className="absolute -right-20 -top-20 size-64 rounded-full bg-white/20 blur-2xl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-28 -left-16 size-72 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative grid size-12 place-items-center rounded-xl bg-white/20 text-sm font-black text-white shadow-lg ring-1 ring-white/40 backdrop-blur">
          ĐV
        </div>
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/90">
            {presentation.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight">
            Xác thực an toàn cho từng vị trí thi đấu.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/90">
            Vai trò được xác định hoàn toàn từ mã bảo mật trên máy chủ.
          </p>
        </div>
      </div>

      <div className="p-7 sm:p-10">
        <p className={`text-xs font-bold uppercase tracking-[0.2em] ${presentation.eyebrowClass}`}>
          {presentation.eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight">{presentation.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{presentation.description}</p>

        {sessionRevocationMessage ? (
          <div
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {sessionRevocationMessage}
          </div>
        ) : null}

        {sessionQuery.isError ? (
          <div
            className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Không thể khôi phục phiên trước đó. Bạn vẫn có thể đăng nhập lại.
          </div>
        ) : null}

        {takeoverChallenge ? (
          <div
            aria-labelledby="takeover-title"
            className="mt-7 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950"
            role="alertdialog"
          >
            <h3 className="font-bold" id="takeover-title">
              Mã này đang được sử dụng trên một thiết bị hoặc trình duyệt khác.
            </h3>
            <p className="mt-2 text-sm">Bạn có muốn tiếp tục trên thiết bị này không?</p>
            <div className="mt-5 flex gap-3">
              <Button disabled={isSubmitting} onClick={() => void handleTakeover()} type="button">
                {isSubmitting ? 'Đang tiếp quản…' : 'Có, tiếp tục'}
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={cancelTakeover}
                type="button"
                variant="outline"
              >
                Không
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="mt-7 space-y-5"
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div>
              <label className="text-sm font-semibold" htmlFor={`${expectedRole}-match-id`}>
                Mã trận đấu
              </label>
              <input
                aria-describedby={formErrors.matchId ? `${expectedRole}-match-id-error` : undefined}
                aria-invalid={Boolean(formErrors.matchId)}
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                className="mt-2 h-14 w-full rounded-lg border border-input bg-white/80 px-4 font-mono text-base uppercase tracking-[0.12em] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                id={`${expectedRole}-match-id`}
                maxLength={32}
                name="matchId"
                onChange={(event) => {
                  setMatchId(event.target.value.toUpperCase());
                }}
                spellCheck={false}
                type="text"
                value={matchId}
              />
              {formErrors.matchId ? (
                <p
                  className="mt-1.5 text-sm text-destructive"
                  id={`${expectedRole}-match-id-error`}
                >
                  {formErrors.matchId}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-semibold" htmlFor={`${expectedRole}-security-code`}>
                Mã bảo mật
              </label>
              <input
                aria-describedby={
                  formErrors.securityCode ? `${expectedRole}-security-code-error` : undefined
                }
                aria-invalid={Boolean(formErrors.securityCode)}
                autoCapitalize="characters"
                autoComplete="off"
                className="mt-2 h-14 w-full rounded-lg border border-input bg-white/80 px-4 font-mono text-base uppercase tracking-wider outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                id={`${expectedRole}-security-code`}
                maxLength={64}
                name="securityCode"
                onChange={(event) => {
                  setSecurityCode(event.target.value);
                }}
                spellCheck={false}
                type="password"
                value={securityCode}
              />
              {formErrors.securityCode ? (
                <p
                  className="mt-1.5 text-sm text-destructive"
                  id={`${expectedRole}-security-code-error`}
                >
                  {formErrors.securityCode}
                </p>
              ) : null}
            </div>

            {requestError ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {requestError}
              </div>
            ) : null}

            <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
              {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
