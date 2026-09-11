import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/services/api/auth';
import { ApiClientError } from '@/services/api/client';

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
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
      <h1 className="text-3xl font-black">Đăng ký tài khoản</h1>
      <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        {fields.map(([name, label]) => (
          <label className="block" key={name}>
            {label}
            <input
              className="mt-1 w-full rounded border p-2"
              name={name}
              required={name !== 'organization'}
              type={name === 'email' ? 'email' : 'text'}
            />
          </label>
        ))}
        <label className="block">
          Mật khẩu
          <input
            className="mt-1 w-full rounded border p-2"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <label className="block">
          Xác nhận mật khẩu
          <input
            className="mt-1 w-full rounded border p-2"
            minLength={8}
            name="passwordConfirmation"
            required
            type="password"
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Đang đăng ký…' : 'Đăng ký'}
        </button>
      </form>
    </section>
  );
}
