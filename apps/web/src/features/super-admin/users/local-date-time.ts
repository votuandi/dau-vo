/** Converts an API UTC instant to the wall-clock value expected by datetime-local. */
export function toLocalDateTimeInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear().toString()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Converts a datetime-local wall-clock value to one UTC ISO instant, exactly once. */
export function localDateTimeInputToIso(value: string): string | null {
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2})$/u.exec(value);
  if (displayMatch) {
    const [, day, month, year, hours, minutes] = displayMatch;
    if (!day || !month || !year || !hours || !minutes) return null;
    value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
