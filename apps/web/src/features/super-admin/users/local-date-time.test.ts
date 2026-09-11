import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDateTimeInputToIso, toLocalDateTimeInput } from './local-date-time';

declare const process: { env: Record<string, string | undefined> };

const originalTimezone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Ho_Chi_Minh';
});
afterAll(() => {
  process.env.TZ = originalTimezone;
});

describe('datetime-local conversion', () => {
  it('round-trips an instant without a seven-hour shift in Vietnam', () => {
    const instant = '2030-01-01T00:00:00.000Z';
    expect(toLocalDateTimeInput(instant)).toBe('2030-01-01T07:00');
    expect(localDateTimeInputToIso('2030-01-01T07:00')).toBe(instant);
  });

  it('rejects invalid local input', () => {
    expect(localDateTimeInputToIso('not-a-date')).toBeNull();
  });
});
