/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { Button } from '@/components/ui/button';

export function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[3] ?? ''}/${match[2] ?? ''}/${match[1] ?? ''}` : '';
}
export function parseDateOnly(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? `${year ?? ''}-${month ?? ''}-${day ?? ''}`
    : null;
}
function dateFromDateOnly(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}
function dateOnlyFromDate(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
type TextInputProps = Pick<
  ComponentPropsWithoutRef<'input'>,
  'className' | 'disabled' | 'id' | 'name' | 'required'
>;
interface DateInputProps extends TextInputProps {
  readonly onChange: (value: string) => void;
  readonly value: string;
}

/** Date-only input: typed DD/MM/YYYY plus an accessible maintained calendar popover. */
export function DateInput({
  className,
  disabled,
  id,
  name,
  onChange,
  required,
  value,
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatDateOnly(value));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  useEffect(() => {
    setDisplayValue(formatDateOnly(value));
  }, [value]);
  function commitText() {
    if (!displayValue) {
      setError('');
      onChange('');
      return;
    }
    const parsed = parseDateOnly(displayValue);
    if (!parsed) {
      setError('Nhập ngày hợp lệ theo định dạng DD/MM/YYYY.');
      return;
    }
    setError('');
    onChange(parsed);
    setDisplayValue(formatDateOnly(parsed));
  }
  return (
    <div className="relative mt-2">
      <div className="flex gap-2">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          className={`${className ?? ''} mt-0`}
          disabled={disabled}
          id={id}
          inputMode="numeric"
          name={name}
          onBlur={commitText}
          onChange={(event) => {
            setDisplayValue(event.target.value);
            setError('');
            if (!event.target.value) onChange('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          pattern="\d{2}/\d{2}/\d{4}"
          placeholder="DD/MM/YYYY"
          ref={inputRef}
          required={required}
          type="text"
          value={displayValue}
        />
        <Button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Mở lịch"
          disabled={disabled}
          onClick={() => {
            setOpen((current) => !current);
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          📅
        </Button>
      </div>
      {error ? (
        <p className="mt-1 text-sm text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <div
          aria-label="Chọn ngày"
          className="absolute z-20 mt-2 rounded-xl border border-border bg-card p-3 shadow-xl"
          role="dialog"
        >
          <DayPicker
            animate
            autoFocus
            mode="single"
            onSelect={(date) => {
              if (date) {
                const next = dateOnlyFromDate(date);
                onChange(next);
                setDisplayValue(formatDateOnly(next));
                setError('');
              }
              setOpen(false);
              inputRef.current?.focus();
            }}
            selected={dateFromDateOnly(value)}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              disabled={(disabled ?? false) || !value}
              onClick={() => {
                onChange('');
                setDisplayValue('');
                setError('');
                setOpen(false);
                inputRef.current?.focus();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Xóa ngày
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                inputRef.current?.focus();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Đóng
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DateTimeInput(
  props: TextInputProps & { readonly onChange: (value: string) => void; readonly value: string },
) {
  const { onChange, ...inputProps } = props;
  return (
    <input
      {...inputProps}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      type="datetime-local"
    />
  );
}
