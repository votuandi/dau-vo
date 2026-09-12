import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  authenticatedUserQueryKey,
  authenticatedUserQueryOptions,
} from '@/features/auth/authenticated-user-session';
import { getAccessLandingPath, getSafeReturnPath } from '@/features/auth/role-aware-routing';
import { effectiveAdminAccessState, entitlementQueryOptions } from '@/features/auth/admin-access';
import { authApi } from '@/services/api/auth';
import { ApiClientError } from '@/services/api/client';
import { inputClassName } from '@/features/admin-management/presentation';

interface LoginFormErrors {
  readonly username?: string;
  readonly password?: string;
}

function validateLoginForm(username: string, password: string): LoginFormErrors {
  const errors: { username?: string; password?: string } = {};

  if (username.trim().length === 0) {
    errors.username = 'Vui lòng nhập tên đăng nhập.';
  }

  if (password.length === 0) {
    errors.password = 'Vui lòng nhập mật khẩu.';
  }

  return errors;
}

function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.body.code === 'INVALID_CREDENTIALS') {
      return 'Tên đăng nhập hoặc mật khẩu không đúng.';
    }

    if (error.status === 429) {
      return error.body.message ?? 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.';
    }

    return error.body.message ?? 'Không thể đăng nhập. Vui lòng thử lại.';
  }

  return 'Không thể kết nối đến máy chủ. Vui lòng thử lại.';
}

export function AdminLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(authenticatedUserQueryOptions);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<LoginFormErrors>({});

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async (session) => {
      queryClient.setQueryData(authenticatedUserQueryKey, session);
      const entitlement = await queryClient.query({
        ...entitlementQueryOptions,
        staleTime: 'static',
      });
      void navigate(
        getSafeReturnPath(location.state) ??
          getAccessLandingPath(effectiveAdminAccessState(session.user, entitlement)),
        {
          replace: true,
        },
      );
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validateLoginForm(username, password);
    setFormErrors(errors);
    loginMutation.reset();

    if (errors.username || errors.password) {
      return;
    }

    loginMutation.mutate({ username: username.trim(), password });
  }

  if (sessionQuery.isSuccess && sessionQuery.data) {
    return <Navigate replace to="/" />;
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/80 bg-card/90 shadow-2xl shadow-blue-950/10 backdrop-blur md:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-sky-700 via-blue-950 to-red-800 p-10 text-white md:flex md:flex-col md:justify-between">
        <span
          aria-hidden="true"
          className="absolute -right-20 -top-20 size-64 rounded-full bg-white/15 blur-2xl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-28 -left-16 size-72 rounded-full bg-red-300/20 blur-3xl"
        />
        <div className="relative grid size-12 place-items-center rounded-xl bg-white/20 text-sm font-black text-white shadow-lg ring-1 ring-white/40 backdrop-blur">
          ĐV
        </div>
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/90">
            Khu vực quản trị
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight">
            Điều hành giải đấu an toàn và tập trung.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/90">
            Đăng nhập bằng tài khoản quản trị được cấp để truy cập bảng điều khiển.
          </p>
        </div>
      </div>

      <div className="p-7 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Đấu Võ</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight">Đăng nhập quản trị</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Nhập thông tin tài khoản để tiếp tục.
        </p>

        {sessionQuery.isError ? (
          <div
            className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Không thể khôi phục phiên trước đó. Bạn vẫn có thể đăng nhập lại.
          </div>
        ) : null}

        <form className="mt-7 space-y-5" noValidate onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="admin-username">
              Tên đăng nhập
            </label>
            <input
              aria-describedby={formErrors.username ? 'admin-username-error' : undefined}
              aria-invalid={Boolean(formErrors.username)}
              autoCapitalize="none"
              autoComplete="username"
              className={inputClassName}
              disabled={loginMutation.isPending}
              id="admin-username"
              maxLength={100}
              name="username"
              onChange={(event) => {
                setUsername(event.target.value);
              }}
              spellCheck={false}
              type="text"
              value={username}
            />
            {formErrors.username ? (
              <p className="form-error" id="admin-username-error">
                {formErrors.username}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="admin-password">
              Mật khẩu
            </label>
            <input
              aria-describedby={formErrors.password ? 'admin-password-error' : undefined}
              aria-invalid={Boolean(formErrors.password)}
              autoComplete="current-password"
              className={inputClassName}
              disabled={loginMutation.isPending}
              id="admin-password"
              maxLength={256}
              name="password"
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              type="password"
              value={password}
            />
            {formErrors.password ? (
              <p className="form-error" id="admin-password-error">
                {formErrors.password}
              </p>
            ) : null}
          </div>

          {loginMutation.isError ? (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {getLoginErrorMessage(loginMutation.error)}
            </div>
          ) : null}

          <Button className="w-full" disabled={loginMutation.isPending} size="lg" type="submit">
            {loginMutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </form>
      </div>
    </section>
  );
}
