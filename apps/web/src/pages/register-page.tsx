import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { authenticatedUserQueryKey } from '@/features/auth/authenticated-user-session';
import { authApi } from '@/services/api/auth';
import { ApiClientError } from '@/services/api/client';
import { passwordValidationMessage } from '@/features/auth/password-policy';
import { Button } from '@/components/ui/button';
import { inputClassName } from '@/features/admin-management/presentation';

function value(data: FormData, key: string): string {
  const item = data.get(key);
  return typeof item === 'string' ? item : '';
}

export function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const password = value(data, 'password');
    const passwordError = passwordValidationMessage(password);
    if (passwordError !== null) {
      setError(passwordError);
      return;
    }
    if (password !== value(data, 'passwordConfirmation')) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }
    setPending(true);
    try {
      const session = await authApi.register({
        fullName: value(data, 'fullName'),
        username: value(data, 'username'),
        email: value(data, 'email'),
        phone: value(data, 'phone'),
        organization: value(data, 'organization'),
        password,
      });
      // Seed the session so the authenticated guard does not reuse a cached
      // anonymous result and bounce the new user back to the login page.
      queryClient.setQueryData(authenticatedUserQueryKey, session);
      await navigate('/account', { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? (cause.body.message ?? 'Không thể đăng ký.')
          : 'Không thể kết nối đến máy chủ.',
      );
    } finally {
      setPending(false);
    }
  }
  const fields = [
    ['fullName', 'Họ và tên', 'Nguyễn Văn A'],
    ['username', 'Tên đăng nhập', 'nguyenvana'],
    ['email', 'Email', 'ban@tochuc.vn'],
    ['phone', 'Số điện thoại', '0901234567'],
    ['organization', 'Đơn vị', 'CLB / Liên đoàn (tùy chọn)'],
  ] as const;
  return (
    <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/50 bg-card/35 p-7 shadow-2xl shadow-blue-950/20 backdrop-blur-lg backdrop-saturate-150 sm:p-10">
      <div className="flex items-center gap-3.5">
        <img
          src={`${import.meta.env.BASE_URL}logo.webp`}
          alt="Logo Chấm Điểm Võ Thuật"
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl bg-white/20 object-contain p-1 shadow-sm ring-1 ring-white/40 backdrop-blur"
        />
        <div>
          <p className="text-xs font-medium text-muted-foreground">Chấm Điểm Võ Thuật</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Đăng ký tài khoản
          </h1>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Tạo tài khoản để bắt đầu quản lý giải đấu của bạn.
      </p>
      <form className="mt-7 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        {fields.map(([name, label, placeholder]) => (
          <label
            className={`form-field ${name === 'organization' ? 'sm:col-span-2' : ''}`}
            key={name}
          >
            {label}
            <input
              className={inputClassName}
              disabled={pending}
              name={name}
              placeholder={placeholder}
              required={name !== 'organization'}
              type={name === 'email' ? 'email' : 'text'}
            />
          </label>
        ))}
        <label className="form-field">
          Mật khẩu
          <input
            className={inputClassName}
            disabled={pending}
            minLength={8}
            name="password"
            placeholder="Ít nhất 8 ký tự"
            required
            type="password"
          />
        </label>
        <label className="form-field">
          Xác nhận mật khẩu
          <input
            className={inputClassName}
            disabled={pending}
            minLength={8}
            name="passwordConfirmation"
            placeholder="Nhập lại mật khẩu"
            required
            type="password"
          />
        </label>
        {error ? (
          <Alert className="sm:col-span-2" role="alert" tone="error">
            {error}
          </Alert>
        ) : null}
        <div className="sm:col-span-2">
          <Button className="w-full" disabled={pending} size="lg" type="submit">
            <UserPlus aria-hidden="true" className="size-4" />
            {pending ? 'Đang đăng ký…' : 'Đăng ký'}
          </Button>
        </div>
      </form>
      <p className="mt-6 border-t border-border/70 pt-5 text-center text-sm text-muted-foreground">
        Đã có tài khoản?{' '}
        <Link className="font-bold text-primary hover:underline" to="/login">
          Đăng nhập
        </Link>
      </p>
    </section>
  );
}
