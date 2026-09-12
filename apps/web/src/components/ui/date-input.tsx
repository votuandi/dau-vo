import { useEffect, useState, type ComponentPropsWithoutRef } from 'react';

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return '';
  const [, year, month, day] = match;
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

type TextInputProps = Pick<
  ComponentPropsWithoutRef<'input'>,
  'className' | 'disabled' | 'id' | 'maxLength' | 'name' | 'required'
>;

interface DateInputProps extends TextInputProps {
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly value: string;
}

/** A locale-independent date entry field. Its value remains YYYY-MM-DD for APIs. */
export function DateInput({
  className,
  disabled,
  id,
  maxLength,
  name,
  onChange,
  required,
  value,
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatDate(value));

  useEffect(() => {
    setDisplayValue(formatDate(value));
  }, [value]);

  return (
    <input
      className={className}
      disabled={disabled}
      id={id}
      inputMode="numeric"
      maxLength={maxLength}
      name={name}
      onBlur={() => {
        setDisplayValue(formatDate(value));
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDisplayValue(next);
        if (!next) onChange('');
        else {
          const parsed = parseDate(next);
          if (parsed) onChange(parsed);
        }
      }}
      pattern="\d{2}/\d{2}/\d{4}"
      placeholder="DD/MM/YYYY"
      required={required}
      type="text"
      value={displayValue}
    />
  );
}

function formatDateTime(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/u.exec(value);
  if (!match) return '';
  const [, date, time] = match;
  if (!date || !time) return '';
  return `${formatDate(date)} ${time}`;
}

function parseDateTime(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;
  const [, day, month, year, hours, minutes] = match;
  if (!day || !month || !year || !hours || !minutes) return null;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  );
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hours) ||
    date.getMinutes() !== Number(minutes)
  ) {
    return null;
  }
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

interface DateTimeInputProps extends Omit<TextInputProps, 'maxLength'> {
  readonly onChange: (value: string) => void;
  readonly value: string;
}

/** A locale-independent date-time entry field. Its value remains YYYY-MM-DDTHH:mm. */
export function DateTimeInput({
  className,
  disabled,
  id,
  name,
  onChange,
  required,
  value,
}: DateTimeInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatDateTime(value));

  useEffect(() => {
    setDisplayValue(formatDateTime(value));
  }, [value]);

  return (
    <input
      className={className}
      disabled={disabled}
      id={id}
      inputMode="numeric"
      name={name}
      onBlur={() => {
        setDisplayValue(formatDateTime(value));
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDisplayValue(next);
        if (!next) onChange('');
        else {
          const parsed = parseDateTime(next);
          if (parsed) onChange(parsed);
        }
      }}
      pattern="\d{2}/\d{2}/\d{4} \d{2}:\d{2}"
      placeholder="DD/MM/YYYY HH:mm"
      required={required}
      type="text"
      value={displayValue}
    />
  );
}
