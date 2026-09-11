import { useEffect, useState } from 'react';

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function parseDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
}

interface DateInputProps {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly value: string;
}

/** A locale-independent date entry field. Its value remains YYYY-MM-DD for APIs. */
export function DateInput({ className, disabled, id, onChange, required, value }: DateInputProps) {
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
      onBlur={() => setDisplayValue(formatDate(value))}
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

interface DateTimeInputProps {
  readonly className?: string;
  readonly defaultValue: string;
  readonly name: string;
  readonly required?: boolean;
}

export function DateTimeInput({ className, defaultValue, name, required }: DateTimeInputProps) {
  const [value, setValue] = useState(() => {
    const [date, time] = defaultValue.split('T');
    return date && time ? `${formatDate(date)} ${time}` : '';
  });

  return (
    <input
      className={className}
      inputMode="numeric"
      name={name}
      onChange={(event) => setValue(event.target.value)}
      pattern="\d{2}/\d{2}/\d{4} \d{2}:\d{2}"
      placeholder="DD/MM/YYYY HH:mm"
      required={required}
      type="text"
      value={value}
    />
  );
}
