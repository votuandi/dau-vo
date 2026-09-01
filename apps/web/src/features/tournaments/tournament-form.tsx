import { useEffect, useState, type FormEvent } from 'react';
import { TournamentStatus } from '@dau-vo/shared-types';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { TournamentInput } from '@/services/api/types';

interface TournamentFormProps {
  initial?: TournamentInput;
  pending: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (input: TournamentInput) => void;
}

export function TournamentForm({
  initial,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: TournamentFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate?.slice(0, 10) ?? '');
  const [status, setStatus] = useState(initial?.status ?? TournamentStatus.DRAFT);

  useEffect(() => {
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setLocation(initial?.location ?? '');
    setStartDate(initial?.startDate?.slice(0, 10) ?? '');
    setEndDate(initial?.endDate?.slice(0, 10) ?? '');
    setStatus(initial?.status ?? TournamentStatus.DRAFT);
  }, [initial]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      location: location.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
    });
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field
        label="Tên giải đấu"
        name="name"
        onChange={(event) => setName(event.target.value)}
        required
        value={name}
      />
      <label className="grid gap-2 text-sm font-semibold">
        Mô tả
        <textarea
          className="min-h-24 rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </label>
      <Field
        label="Địa điểm"
        name="location"
        onChange={(event) => setLocation(event.target.value)}
        value={location}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Ngày bắt đầu"
          name="startDate"
          onChange={(event) => setStartDate(event.target.value)}
          type="date"
          value={startDate}
        />
        <Field
          label="Ngày kết thúc"
          name="endDate"
          onChange={(event) => setEndDate(event.target.value)}
          type="date"
          value={endDate}
        />
      </div>
      <label className="grid gap-2 text-sm font-semibold">
        Trạng thái
        <select
          className="h-11 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          onChange={(event) => setStatus(event.target.value as TournamentStatus)}
          value={status}
        >
          <option value={TournamentStatus.DRAFT}>Bản nháp</option>
          <option value={TournamentStatus.ACTIVE}>Đang diễn ra</option>
          <option value={TournamentStatus.FINISHED}>Đã kết thúc</option>
          <option value={TournamentStatus.ARCHIVED}>Đã lưu trữ</option>
        </select>
      </label>
      <div className="mt-2 flex justify-end gap-3">
        {onCancel ? (
          <Button onClick={onCancel} variant="outline">
            Hủy
          </Button>
        ) : null}
        <Button disabled={pending || !name.trim()} type="submit">
          {pending ? 'Đang lưu…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
