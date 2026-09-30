import { describe, expect, it } from 'vitest';
import type { AthleteImportResult } from '@/services/api/admin-management';
import { summarizeImportUnits, unitStatusLabel } from './athlete-import-summary';

function result(overrides: Partial<AthleteImportResult> = {}): AthleteImportResult {
  return {
    inputIndex: 0,
    rowNumber: 2,
    status: 'created',
    errors: [],
    unit: { name: 'Dojo One', locality: 'Hà Nội', status: 'created', errors: [] },
    athlete: { name: 'Athlete', status: 'created', errors: [] },
    ...overrides,
  };
}

describe('summarizeImportUnits', () => {
  it('lists a repeated normalized unit once without inflating its created count', () => {
    const units = summarizeImportUnits([
      result(),
      result({
        inputIndex: 1,
        rowNumber: 3,
        unit: { name: ' dojo one ', locality: 'hà nội', status: 'existing', errors: [] },
      }),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ status: 'created', label: 'Dojo One — Hà Nội' });
  });

  it('keeps same-name units in different localities separate', () => {
    const units = summarizeImportUnits([
      result(),
      result({
        inputIndex: 1,
        unit: { name: 'Dojo One', locality: 'Đà Nẵng', status: 'existing', errors: [] },
      }),
    ]);
    expect(units).toHaveLength(2);
  });

  it('uses the unit status and errors, not a failed athlete outcome', () => {
    const units = summarizeImportUnits([
      result({
        status: 'failed',
        errors: ['row error'],
        unit: { name: 'Dojo One', locality: 'Hà Nội', status: 'existing', errors: [] },
        athlete: { name: 'Athlete', status: 'failed', errors: ['Birth year invalid'] },
      }),
    ]);
    expect(units[0]).toMatchObject({ status: 'existing', errors: [] });
  });

  it('provides Vietnamese labels for every backend unit outcome', () => {
    expect(
      ['pending', 'created', 'existing', 'restored', 'invalid'].map((status) =>
        unitStatusLabel(status as AthleteImportResult['unit']['status']),
      ),
    ).toEqual(['Sẽ tạo', 'Đã tạo', 'Đã dùng lại', 'Đã khôi phục', 'Không thể xử lý']);
  });
});
