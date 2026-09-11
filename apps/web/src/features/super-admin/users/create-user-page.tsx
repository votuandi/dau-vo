/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { toast } from '@/components/ui/toast';
import { ApiClientError } from '@/services/api/client';
import { superAdminApi, type CreateSuperAdminUserInput } from '@/services/api/super-admin';
import { superAdminUserKeys } from './query-keys';
import { passwordValidationMessage } from '@/features/auth/password-policy';

type AccountType = 'USER' | 'ADMIN';
type Field =
  | Exclude<keyof CreateSuperAdminUserInput, 'initialAdminAccess'>
  | 'passwordConfirmation'
  | 'adminActiveUntil'
  | 'tournamentLimit';
const errorFields: Record<string, Field> = {
  USERNAME_ALREADY_EXISTS: 'username',
  EMAIL_ALREADY_EXISTS: 'email',
  PHONE_ALREADY_EXISTS: 'phone',
  INVALID_PHONE: 'phone',
  INVALID_ENTITLEMENT_PERIOD: 'adminActiveUntil',
  PASSWORD_TOO_LONG: 'password',
  PASSWORD_TOO_SHORT: 'password',
};
const initial = (): Record<Field, string> => ({
  fullName: '',
  username: '',
  email: '',
  phone: '',
  organization: '',
  password: '',
  passwordConfirmation: '',
  adminActiveUntil: '',
  tournamentLimit: '',
});

export function CreateSuperAdminUserPage() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(initial);
  const [accountType, setAccountType] = useState<AccountType>('USER');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const create = useMutation({
    mutationFn: async () => {
      const input: CreateSuperAdminUserInput = {
        fullName: values.fullName.trim(),
        username: values.username.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
        ...(values.organization.trim() ? { organization: values.organization.trim() } : {}),
        ...(accountType === 'ADMIN'
          ? {
              initialAdminAccess: {
                activeUntil: new Date(`${values.adminActiveUntil}T23:59:59`).toISOString(),
                tournamentLimit: Number(values.tournamentLimit),
              },
            }
          : {}),
      };
      return superAdminApi.create(input);
    },
    onSuccess: (user) => {
      void cache.invalidateQueries({ queryKey: superAdminUserKeys.all });
      setValues(initial());
      toast({ title: 'Đã tạo người dùng.', variant: 'success' });
      void navigate(`/super-admin/users/${user.id}`, { replace: true });
    },
    onError: (cause) => {
      setValues((current) => ({ ...current, password: '', passwordConfirmation: '' }));
      if (cause instanceof ApiClientError)
        setErrors({
          [errorFields[cause.body.code ?? ''] ??
          (String(cause.body.message).includes('tournamentLimit')
            ? 'tournamentLimit'
            : 'fullName')]: cause.body.message ?? 'Không thể tạo người dùng.',
        });
    },
  });
  function change(field: Field, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (create.isPending) return;
    const next: Partial<Record<Field, string>> = {};
    if (!values.fullName.trim()) next.fullName = 'Họ và tên là bắt buộc.';
    if (!/^[a-zA-Z0-9._-]{1,100}$/u.test(values.username))
      next.username = 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    if (!/^\S+@\S+\.\S+$/u.test(values.email)) next.email = 'Email không hợp lệ.';
    if (values.phone.trim().length < 6) next.phone = 'Số điện thoại phải có ít nhất 6 ký tự.';
    const passwordError = passwordValidationMessage(values.password);
    if (passwordError !== null) next.password = passwordError;
    if (values.password !== values.passwordConfirmation)
      next.passwordConfirmation = 'Xác nhận mật khẩu không khớp.';
    if (accountType === 'ADMIN') {
      if (!values.adminActiveUntil) next.adminActiveUntil = 'Cần chọn ngày hết hạn quyền quản trị.';
      if (!Number.isInteger(Number(values.tournamentLimit)) || Number(values.tournamentLimit) < 0)
        next.tournamentLimit = 'Giới hạn giải đấu phải là số nguyên từ 0.';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  }
  return (
    <section className="mx-auto w-full max-w-2xl">
      <Link className="text-primary underline" to="/super-admin/users">
        ← Danh sách người dùng
      </Link>
      <h1 className="mt-4 text-3xl font-black">Thêm người dùng</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tài khoản mới mặc định là USER. Quyền ADMIN chỉ được kích hoạt cùng thời hạn và giới hạn
        giải đấu.
      </p>
      <form
        className="mt-6 space-y-4 rounded-xl border border-border bg-card p-5"
        noValidate
        onSubmit={submit}
        ref={form}
      >
        {(['fullName', 'username', 'email', 'phone', 'organization'] as const).map((field) => (
          <FieldInput
            error={errors[field]}
            field={field}
            key={field}
            label={
              {
                fullName: 'Họ và tên',
                username: 'Tên đăng nhập',
                email: 'Email',
                phone: 'Số điện thoại',
                organization: 'Đơn vị (tùy chọn)',
              }[field]
            }
            onChange={change}
            type={field === 'email' ? 'email' : 'text'}
            value={values[field]}
          />
        ))}
        <FieldInput
          error={errors.password}
          field="password"
          label="Mật khẩu"
          onChange={change}
          type="password"
          value={values.password}
        />
        <FieldInput
          error={errors.passwordConfirmation}
          field="passwordConfirmation"
          label="Xác nhận mật khẩu"
          onChange={change}
          type="password"
          value={values.passwordConfirmation}
        />
        <fieldset>
          <legend className="font-semibold">Loại tài khoản ban đầu</legend>
          <label className="mr-5">
            <input
              checked={accountType === 'USER'}
              name="accountType"
              onChange={() => setAccountType('USER')}
              type="radio"
            />{' '}
            USER
          </label>
          <label>
            <input
              checked={accountType === 'ADMIN'}
              name="accountType"
              onChange={() => setAccountType('ADMIN')}
              type="radio"
            />{' '}
            ADMIN
          </label>
        </fieldset>
        {accountType === 'ADMIN' ? (
          <div className="grid gap-4 rounded-lg bg-muted p-4 sm:grid-cols-2">
            <FieldInput
              error={errors.adminActiveUntil}
              field="adminActiveUntil"
              label="Hết hạn quyền quản trị"
              onChange={change}
              type="date"
              value={values.adminActiveUntil}
            />
            <FieldInput
              error={errors.tournamentLimit}
              field="tournamentLimit"
              label="Giới hạn giải đấu"
              onChange={change}
              type="number"
              value={values.tournamentLimit}
            />
          </div>
        ) : null}
        {create.isError && Object.keys(errors).length === 0 ? (
          <p role="alert">Không thể tạo người dùng. Vui lòng thử lại.</p>
        ) : null}
        <div className="flex gap-3">
          <Button disabled={create.isPending} type="submit">
            {create.isPending ? 'Đang tạo…' : 'Tạo người dùng'}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/super-admin/users">Hủy</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}
function FieldInput({
  field,
  label,
  type,
  value,
  error,
  onChange,
}: {
  readonly field: Field;
  readonly label: string;
  readonly type: string;
  readonly value: string;
  readonly error?: string | undefined;
  readonly onChange: (field: Field, value: string) => void;
}) {
  const id = `create-user-${field}`;
  return (
    <label className="block" htmlFor={id}>
      {label}
      {type === 'date' ? (
        <DateInput
          className="mt-1 w-full rounded border p-2"
          id={id}
          onChange={(next) => onChange(field, next)}
          required={field !== 'organization'}
          value={value}
        />
      ) : (
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          className="mt-1 w-full rounded border p-2"
          id={id}
          min={type === 'number' ? 0 : undefined}
          onChange={(e) => onChange(field, e.target.value)}
          required={field !== 'organization'}
          type={type}
          value={value}
        />
      )}
      {error ? (
        <span className="mt-1 block text-sm text-destructive" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
