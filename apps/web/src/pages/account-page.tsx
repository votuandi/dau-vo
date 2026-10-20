import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { effectiveAdminAccessState, entitlementQueryOptions } from '@/features/auth/admin-access';
import {
  authenticatedUserQueryKey,
  authenticatedUserQueryOptions,
} from '@/features/auth/authenticated-user-session';
import { passwordValidationMessage } from '@/features/auth/password-policy';
import { inputClassName } from '@/features/admin-management/presentation';
import {
  authApi,
  type AccountProfile,
  type AuthResponse,
  type UpdateProfileRequest,
} from '@/services/api/auth';
import { ApiClientError } from '@/services/api/client';

const accountProfileQueryKey = (userId: string) => ['auth', 'profile', userId] as const;

type ProfileField = 'fullName' | 'email' | 'phone' | 'organization';
type PasswordField = 'currentPassword' | 'newPassword' | 'passwordConfirmation';

const roleLabels: Record<AccountProfile['role'], string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  ADMIN: 'Quản trị viên',
  USER: 'Người dùng',
};

const profileErrors: Record<string, [ProfileField, string]> = {
  EMAIL_ALREADY_EXISTS: ['email', 'Email này đã được đăng ký bởi tài khoản khác.'],
  PHONE_ALREADY_EXISTS: ['phone', 'Số điện thoại này đã được đăng ký bởi tài khoản khác.'],
  INVALID_PHONE: ['phone', 'Số điện thoại không hợp lệ.'],
};

const passwordErrors: Record<string, [PasswordField, string]> = {
  INVALID_CURRENT_PASSWORD: ['currentPassword', 'Mật khẩu hiện tại không đúng.'],
  PASSWORD_TOO_SHORT: ['newPassword', 'Mật khẩu phải có ít nhất 8 ký tự.'],
  PASSWORD_TOO_LONG: ['newPassword', 'Mật khẩu không được vượt quá 72 byte UTF-8.'],
};

function value(data: FormData, key: string): string {
  const item = data.get(key);
  return typeof item === 'string' ? item : '';
}

function Card({ children }: { readonly children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      {children}
    </section>
  );
}

function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}) {
  if (!message) return null;
  return (
    <span className="mt-1.5 block text-sm font-normal text-destructive" id={id}>
      {message}
    </span>
  );
}

function MembershipNotice() {
  return (
    <Alert
      className="items-center border-red-300 bg-red-50 ring-2 ring-red-200 dark:border-red-500/50 dark:bg-red-950/40 dark:ring-red-900/60"
      role="alert"
      tone="error"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-bold text-red-700 dark:text-red-300">
          Bạn chưa đăng ký gói thành viên. Hãy đăng ký để được sử dụng đầy đủ tính năng
        </p>
        <Button asChild className="shrink-0" variant="destructive">
          <Link to="/subscription">Đăng ký gói</Link>
        </Button>
      </div>
    </Alert>
  );
}

function ProfileForm({ profile }: { readonly profile: AccountProfile }) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const update = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (updated) => {
      setErrors({});
      queryClient.setQueryData(accountProfileQueryKey(profile.id), updated);
      queryClient.setQueryData<AuthResponse | null>(authenticatedUserQueryKey, (session) =>
        session ? { user: { ...session.user, fullName: updated.fullName } } : session,
      );
      toast({ title: 'Đã cập nhật thông tin tài khoản.', variant: 'success' });
    },
    onError: (cause) => {
      const known = cause instanceof ApiClientError ? profileErrors[cause.body.code ?? ''] : null;
      if (known) {
        setErrors({ [known[0]]: known[1] });
        return;
      }
      toast({
        title:
          cause instanceof ApiClientError
            ? 'Không thể cập nhật thông tin.'
            : 'Không thể kết nối đến máy chủ.',
        variant: 'destructive',
      });
    },
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Record<ProfileField, string> = {
      fullName: value(data, 'fullName').trim(),
      email: value(data, 'email').trim(),
      phone: value(data, 'phone').trim(),
      organization: value(data, 'organization').trim(),
    };
    // Send only what changed so an untouched email or phone is not re-checked.
    const changes: { -readonly [Key in keyof UpdateProfileRequest]: string } = {};
    for (const field of Object.keys(next) as ProfileField[]) {
      if (next[field] !== (profile[field] ?? '')) changes[field] = next[field];
    }
    if (Object.keys(changes).length === 0) {
      toast({ title: 'Không có thông tin nào thay đổi.', variant: 'success' });
      return;
    }
    setErrors({});
    update.mutate(changes);
  }

  const fields: readonly [ProfileField, string, string, boolean][] = [
    ['fullName', 'Họ và tên', 'text', true],
    ['email', 'Email', 'email', true],
    ['phone', 'Số điện thoại', 'tel', true],
    ['organization', 'Đơn vị', 'text', false],
  ];

  return (
    <Card>
      <h2 className="text-xl font-bold">Thông tin cá nhân</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Email và số điện thoại phải chưa được tài khoản khác sử dụng.
      </p>
      <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={submit}>
        {fields.map(([name, label, type, required]) => (
          <label className="form-field" key={name}>
            {label}
            <input
              aria-describedby={errors[name] ? `${name}-error` : undefined}
              aria-invalid={errors[name] ? true : undefined}
              className={inputClassName}
              defaultValue={profile[name] ?? ''}
              disabled={update.isPending}
              minLength={name === 'phone' ? 6 : undefined}
              name={name}
              required={required}
              type={type}
            />
            <FieldError id={`${name}-error`} message={errors[name]} />
          </label>
        ))}
        <div className="sm:col-span-2">
          <Button disabled={update.isPending} type="submit">
            {update.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({});
  const change = useMutation({
    mutationFn: authApi.changePassword,
    onError: (cause) => {
      const known = cause instanceof ApiClientError ? passwordErrors[cause.body.code ?? ''] : null;
      if (known) {
        setErrors({ [known[0]]: known[1] });
        return;
      }
      toast({
        title:
          cause instanceof ApiClientError
            ? 'Không thể đổi mật khẩu.'
            : 'Không thể kết nối đến máy chủ.',
        variant: 'destructive',
      });
    },
  });

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = value(data, 'newPassword');
    const policyError = passwordValidationMessage(newPassword);
    if (policyError !== null) {
      setErrors({ newPassword: policyError });
      return;
    }
    if (newPassword !== value(data, 'passwordConfirmation')) {
      setErrors({ passwordConfirmation: 'Xác nhận mật khẩu không khớp.' });
      return;
    }
    setErrors({});
    change.mutate(
      { currentPassword: value(data, 'currentPassword'), newPassword },
      {
        onSuccess: () => {
          form.reset();
          toast({ title: 'Đã đổi mật khẩu.', variant: 'success' });
        },
      },
    );
  }

  const fields: readonly [PasswordField, string, string][] = [
    ['currentPassword', 'Mật khẩu hiện tại', 'current-password'],
    ['newPassword', 'Mật khẩu mới', 'new-password'],
    ['passwordConfirmation', 'Xác nhận mật khẩu mới', 'new-password'],
  ];

  return (
    <Card>
      <h2 className="text-xl font-bold">Đổi mật khẩu</h2>
      <form className="mt-6 grid gap-5" onSubmit={submit}>
        {fields.map(([name, label, autoComplete]) => (
          <label className="form-field" key={name}>
            {label}
            <input
              aria-describedby={errors[name] ? `${name}-error` : undefined}
              aria-invalid={errors[name] ? true : undefined}
              autoComplete={autoComplete}
              className={inputClassName}
              disabled={change.isPending}
              minLength={name === 'currentPassword' ? undefined : 8}
              name={name}
              required
              type="password"
            />
            <FieldError id={`${name}-error`} message={errors[name]} />
          </label>
        ))}
        <div>
          <Button disabled={change.isPending} type="submit">
            {change.isPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const sessionQuery = useQuery(authenticatedUserQueryOptions);
  const user = sessionQuery.data?.user;
  const profileQuery = useQuery({
    queryKey: accountProfileQueryKey(user?.id ?? ''),
    queryFn: authApi.profile,
    enabled: Boolean(user),
  });
  const entitlementQuery = useQuery({ ...entitlementQueryOptions, enabled: Boolean(user) });
  const hasNoMembership =
    user !== undefined &&
    entitlementQuery.isSuccess &&
    // Expired packages (read-only window included) count as no membership.
    ['HIDDEN', 'EXPIRED_READ_ONLY'].includes(
      effectiveAdminAccessState(user, entitlementQuery.data),
    );

  if (profileQuery.isPending) return <p aria-live="polite">Đang tải thông tin tài khoản…</p>;
  if (profileQuery.isError)
    return (
      <Card>
        <p role="alert">Không thể tải thông tin tài khoản.</p>
        <Button className="mt-4" onClick={() => void profileQuery.refetch()} type="button">
          Thử lại
        </Button>
      </Card>
    );

  const profile = profileQuery.data;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Tài khoản</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Quản lý thông tin cá nhân và bảo mật tài khoản của bạn.
        </p>
      </header>
      {hasNoMembership ? <MembershipNotice /> : null}
      <Card>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Tên đăng nhập</dt>
            <dd className="mt-1 font-semibold">{profile.username}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vai trò</dt>
            <dd className="mt-1 font-semibold">{roleLabels[profile.role]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ngày tạo</dt>
            <dd className="mt-1 font-semibold">
              {new Date(profile.createdAt).toLocaleDateString('vi-VN')}
            </dd>
          </div>
        </dl>
      </Card>
      <ProfileForm
        // Remount with fresh defaults whenever the saved profile changes.
        key={[profile.fullName, profile.email, profile.phone, profile.organization].join('\u0000')}
        profile={profile}
      />
      <PasswordForm />
    </div>
  );
}
