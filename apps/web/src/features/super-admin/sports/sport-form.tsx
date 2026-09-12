import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { inputClassName } from '@/features/admin-management/presentation';
import type {
  CreateSportInput,
  ManagedSport,
  SportGroup,
  UpdateSportInput,
} from '@/services/api/super-admin';

interface Values { name: string; code: string; sportGroupId: string; isActive: boolean }
const empty = (): Values => ({ name: '', code: '', sportGroupId: '', isActive: true });

export function SportForm({
  groups,
  sport,
  pending,
  onCancel,
  onSubmit,
}: {
  readonly groups: readonly SportGroup[];
  readonly sport?: ManagedSport;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (input: CreateSportInput | UpdateSportInput) => void;
}) {
  const [values, setValues] = useState<Values>(empty);
  const [error, setError] = useState<string>();
  const used = (sport?.tournamentCount ?? 0) > 0;
  const groupLocked = used || sport?.canChangeSportGroup === false;
  useEffect(() => {
    setValues(
      sport
        ? {
            name: sport.name,
            code: sport.code,
            sportGroupId: sport.sportGroupId,
            isActive: sport.isActive,
          }
        : empty(),
    );
    setError(undefined);
  }, [sport]);
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (pending) return;
    if (!values.name.trim() || !values.sportGroupId || (!sport && !values.code.trim())) {
      setError('Vui lòng nhập đầy đủ các trường bắt buộc.');
      return;
    }
    if (!sport && !/^[A-Z0-9_]{2,100}$/u.test(values.code)) {
      setError('Mã phải gồm chữ in hoa, số hoặc dấu gạch dưới (2–100 ký tự).');
      return;
    }
    setError(undefined);
    onSubmit(
      sport
        ? {
            name: values.name.trim(),
            isActive: values.isActive,
            ...(groupLocked ? {} : { sportGroupId: values.sportGroupId }),
          }
        : { ...values, name: values.name.trim(), code: values.code.trim() },
    );
  }
  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-card p-5"
      noValidate
      onSubmit={submit}
    >
      <h2 className="text-xl font-bold">
        {sport ? 'Chỉnh sửa môn thể thao' : 'Thêm môn thể thao'}
      </h2>
      <label className="block">
        Tên môn thể thao
        <input
          className={inputClassName}
          disabled={pending}
          onChange={(e) => { setValues((v) => ({ ...v, name: e.target.value })); }}
          required
          value={values.name}
        />
      </label>
      <label className="block">
        Mã
        <input
          className={inputClassName}
          disabled={pending || Boolean(sport)}
          onChange={(e) => { setValues((v) => ({ ...v, code: e.target.value.toUpperCase() })); }}
          readOnly={Boolean(sport)}
          required
          value={values.code}
        />
        {sport ? (
          <span className="mt-1 block text-sm text-muted-foreground">
            Mã môn thể thao không thể thay đổi.
          </span>
        ) : null}
      </label>
      <label className="block">
        Nhóm môn thể thao
        <select
          className={inputClassName}
          disabled={pending || groupLocked}
          onChange={(e) => { setValues((v) => ({ ...v, sportGroupId: e.target.value })); }}
          required
          value={values.sportGroupId}
        >
          <option value="">Chọn nhóm môn thể thao</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.code})
            </option>
          ))}
        </select>
        {used ? (
          <span className="mt-1 block text-sm text-destructive">
            Không thể thay đổi nhóm vì môn thể thao đã được sử dụng bởi giải đấu.
          </span>
        ) : null}
      </label>
      <fieldset>
        <legend className="font-semibold">Trạng thái</legend>
        <label className="mr-5">
          <input
            checked={values.isActive}
            disabled={pending}
            onChange={() => { setValues((v) => ({ ...v, isActive: true })); }}
            name="sport-status"
            type="radio"
          />{' '}
          Đang hoạt động
        </label>
        <label>
          <input
            checked={!values.isActive}
            disabled={pending || (sport?.isActive === true && (used || sport.canDisable === false))}
            onChange={() => { setValues((v) => ({ ...v, isActive: false })); }}
            name="sport-status"
            type="radio"
          />{' '}
          Đã vô hiệu hóa
        </label>
        {sport?.isActive && used ? (
          <span className="mt-1 block text-sm text-destructive">
            Không thể vô hiệu hóa vì môn thể thao đã được sử dụng bởi giải đấu.
          </span>
        ) : null}
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button disabled={pending} type="submit">
          {pending ? 'Đang lưu…' : 'Lưu'}
        </Button>
        <Button disabled={pending} onClick={onCancel} type="button" variant="outline">
          Hủy
        </Button>
      </div>
    </form>
  );
}
