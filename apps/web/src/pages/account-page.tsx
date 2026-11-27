import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { CalendarDays, KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  return <section className="app-card p-6 sm:p-8">{children}</section>;
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
    <Alert className="items-center" role="alert" tone="warning">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-bold text-amber-900">
          Bạn chưa đăng ký gói thành viên. Hãy đăng ký để được sử dụng đầy đủ tính năng
        </p>
        <Button asChild className="shrink-0">
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
      <div className="flex items-center gap-3">
        <UserRound aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Thông tin cá nhân</h2>
          <p className="text-sm text-muted-foreground">
            Email và số điện thoại phải chưa được tài khoản khác sử dụng.
          </p>
        </div>
      </div>
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
        <div className="flex justify-end border-t border-border/70 pt-4 sm:col-span-2">
          <Button disabled={update.isPending} type="submit">
            <Save aria-hidden="true" className="size-4" />
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
      <div className="flex items-center gap-3">
        <KeyRound aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Đổi mật khẩu</h2>
          <p className="text-sm text-muted-foreground">
            Sử dụng mật khẩu từ 8 ký tự trở lên để bảo vệ tài khoản.
          </p>
        </div>
      </div>
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
        <div className="flex justify-end border-t border-border/70 pt-4">
          <Button disabled={change.isPending} type="submit">
            <KeyRound aria-hidden="true" className="size-4" />
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
  const displayName = profile.fullName?.trim() ? profile.fullName : profile.username;
  const initials = displayName.trim().charAt(0).toUpperCase();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tài khoản</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Quản lý thông tin cá nhân và bảo mật tài khoản của bạn.
        </p>
      </header>
      {hasNoMembership ? <MembershipNotice /> : null}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-lg font-semibold text-foreground ring-1 ring-foreground/[0.08]"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{displayName}</h2>
              <Badge tone="neutral">{roleLabels[profile.role]}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-border/70 pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound aria-hidden="true" className="size-3.5" />
              Tên đăng nhập
            </dt>
            <dd className="mt-1 font-mono font-medium text-foreground">{profile.username}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Vai trò
            </dt>
            <dd className="mt-1 font-medium text-foreground">{roleLabels[profile.role]}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Ngày tạo
            </dt>
            <dd className="mt-1 font-medium tabular-nums text-foreground">
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
