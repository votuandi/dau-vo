import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { adminApi } from '@/services/api/endpoints';
import { queryKeys } from '@/services/api/query-keys';
import { ApiClientError } from '@/services/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';

export function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentAdmin = useQuery({
    queryKey: queryKeys.adminMe,
    queryFn: ({ signal }) => adminApi.me(signal),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: () => adminApi.login(username.trim(), password),
    onSuccess: (admin) => {
      queryClient.setQueryData(queryKeys.adminMe, admin);
      const state = location.state as { returnTo?: string } | null;
      void navigate(state?.returnTo ?? '/admin', { replace: true });
    },
  });

  if (currentAdmin.data) return <Navigate replace to="/admin" />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (username.trim() && password) mutation.mutate();
  };

  const invalidCredentials =
    mutation.error instanceof ApiClientError &&
    (mutation.error.status === 401 || mutation.error.body.code === 'INVALID_CREDENTIALS');

  return (
    <main className="auth-background grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md border-white/10 bg-slate-950/90 text-white shadow-2xl backdrop-blur">
        <CardHeader className="pb-3 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-amber-400 text-slate-950">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Điều hành giải đấu</CardTitle>
          <CardDescription className="text-slate-400">
            Đăng nhập bằng tài khoản quản trị được cấp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit}>
            <Field
              autoComplete="username"
              label="Tên đăng nhập"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
            <Field
              autoComplete="current-password"
              error={invalidCredentials ? 'Tên đăng nhập hoặc mật khẩu không đúng.' : undefined}
              label="Mật khẩu"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {mutation.isError && !invalidCredentials ? (
              <p className="text-sm text-red-300">Không thể đăng nhập lúc này. Vui lòng thử lại.</p>
            ) : null}
            <Button className="mt-2 w-full" disabled={mutation.isPending} size="lg" type="submit">
              {mutation.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
