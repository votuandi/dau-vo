import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  authenticatedUserQueryKey,
  authenticatedUserQueryOptions,
} from '@/features/auth/authenticated-user-session';
import { getSafeReturnPath } from '@/features/auth/role-aware-routing';
import { authApi, type AuthenticatedUser } from '@/services/api/auth';
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

// Admins without an active plan are sent on to /account by AdminRouteGuard.
function getPostLoginPath(user: AuthenticatedUser): string {
  return user.role === 'SUPER_ADMIN' ? '/super-admin' : '/admin';
}

export function AdminLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery(authenticatedUserQueryOptions);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<LoginFormErrors>({});

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => {
      // Navigate before publishing the session so the "already signed in"
      // redirect below cannot race this one to a different landing page.
      void navigate(getSafeReturnPath(location.state) ?? getPostLoginPath(session.user), {
        replace: true,
      });
      queryClient.setQueryData(authenticatedUserQueryKey, session);
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

  if (sessionQuery.isSuccess && sessionQuery.data && !loginMutation.isSuccess) {
    return <Navigate replace to={getPostLoginPath(sessionQuery.data.user)} />;
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/50 bg-card/35 shadow-2xl shadow-blue-950/20 backdrop-blur-lg backdrop-saturate-150 md:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-sky-700/60 via-blue-950/60 to-red-800/60 p-10 text-white md:flex md:flex-col md:justify-between">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}logo.webp`}
            alt="Logo Chấm Điểm Võ Thuật"
            width={44}
            height={44}
            className="size-11 rounded-xl bg-white/20 object-contain p-1 shadow-sm ring-1 ring-white/40 backdrop-blur"
          />
          <div>
            <p className="text-sm font-semibold text-white">Chấm Điểm Võ Thuật</p>
            <p className="text-xs text-white/80">Nền tảng điều hành giải đấu</p>
          </div>
        </div>
        <div className="my-8">
          <p className="inline-flex items-center gap-2 text-xs font-medium text-white/90">
            <ShieldCheck aria-hidden="true" className="size-4 text-white/85" />
            Khu vực quản trị
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white">
            Điều hành giải đấu an toàn và tập trung
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/90">
            Đăng nhập bằng tài khoản quản trị được cấp để truy cập bảng điều khiển.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-white/90">
            {[
              'Quản lý hạng cân, đơn vị và vận động viên tập trung',
              'Bốc thăm nhánh đấu tự động và phân công trọng tài',
              'Theo dõi diễn biến và kết quả theo thời gian thực',
            ].map((item) => (
              <li className="flex items-center gap-2.5" key={item}>
                <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/75">Đồng bộ giám định · giám sát · bảng điểm trực tiếp</p>
      </div>

      <div className="bg-white p-7 sm:p-10">
        <p className="text-xs font-medium text-muted-foreground">Chấm Điểm Võ Thuật</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Đăng nhập quản trị
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Nhập thông tin tài khoản để tiếp tục.
        </p>

        {sessionQuery.isError ? (
          <Alert className="mt-6" role="status" tone="warning">
            Không thể khôi phục phiên trước đó. Bạn vẫn có thể đăng nhập lại.
          </Alert>
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
              placeholder="Nhập tên đăng nhập"
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
            <div className="relative">
              <input
                aria-describedby={formErrors.password ? 'admin-password-error' : undefined}
                aria-invalid={Boolean(formErrors.password)}
                autoComplete="current-password"
                className={`${inputClassName} pr-11`}
                disabled={loginMutation.isPending}
                id="admin-password"
                maxLength={256}
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                placeholder="Nhập mật khẩu"
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-2 top-[calc(50%+3px)] grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setShowPassword((prev) => !prev);
                }}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
            {formErrors.password ? (
              <p className="form-error" id="admin-password-error">
                {formErrors.password}
              </p>
            ) : null}
          </div>

          {loginMutation.isError ? (
            <Alert role="alert" tone="error">
              {getLoginErrorMessage(loginMutation.error)}
            </Alert>
          ) : null}

          <Button className="w-full" disabled={loginMutation.isPending} size="lg" type="submit">
            <LogIn aria-hidden="true" className="size-4" />
            {loginMutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </form>

        <p className="mt-6 border-t border-border/70 pt-5 text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link className="font-bold text-primary hover:underline" to="/register">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </section>
  );
}
