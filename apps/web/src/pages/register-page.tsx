import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
      await authApi.register({
        fullName: value(data, 'fullName'),
        username: value(data, 'username'),
        email: value(data, 'email'),
        phone: value(data, 'phone'),
        organization: value(data, 'organization'),
        password,
      });
      await navigate('/tournaments', { replace: true });
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
    ['fullName', 'Họ và tên'],
    ['username', 'Tên đăng nhập'],
    ['email', 'Email'],
    ['phone', 'Số điện thoại'],
    ['organization', 'Đơn vị'],
  ];
  return (
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-lg shadow-sky-950/5 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Đấu Võ</p>
      <h1 className="mt-3 text-3xl font-black tracking-tight">Đăng ký tài khoản</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Tạo tài khoản để bắt đầu quản lý giải đấu của bạn.
      </p>
      <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
        {fields.map(([name, label]) => (
          <label className="form-field" key={name}>
            {label}
            <input
              className={inputClassName}
              disabled={pending}
              name={name}
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
            required
            type="password"
          />
        </label>
        {error ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? 'Đang đăng ký…' : 'Đăng ký'}
        </Button>
      </form>
    </section>
  );
}
