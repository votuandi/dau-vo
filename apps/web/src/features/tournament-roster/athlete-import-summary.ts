import type { AthleteImportResult } from '@/services/api/admin-management';

export type UnitImportStatus = AthleteImportResult['unit']['status'];

export interface UnitImportSummary {
  readonly id: string;
  readonly label: string;
  readonly status: UnitImportStatus;
  readonly errors: readonly string[];
}

const statusPriority: Record<UnitImportStatus, number> = {
  invalid: 5,
  created: 4,
  restored: 3,
  existing: 2,
  pending: 1,
};

function normalized(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('vi');
}

/** Mirrors the backend's normalized name + locality participating-unit identity. */
export function unitIdentity(unit: AthleteImportResult['unit']): string {
  return `${normalized(unit.name)}\u0000${normalized(unit.locality)}`;
}

export function summarizeImportUnits(
  results: readonly AthleteImportResult[],
): readonly UnitImportSummary[] {
  const grouped = new Map<string, UnitImportSummary>();
  for (const result of results) {
    const id = unitIdentity(result.unit);
    const candidate: UnitImportSummary = {
      id,
      label: `${result.unit.name} — ${result.unit.locality}`,
      status: result.unit.status,
      errors: result.unit.errors,
    };
    const current = grouped.get(id);
    if (!current || statusPriority[candidate.status] > statusPriority[current.status]) {
      grouped.set(id, candidate);
    }
  }
  return [...grouped.values()];
}

export function unitStatusLabel(status: UnitImportStatus): string {
  switch (status) {
    case 'pending':
      return 'Sẽ tạo';
    case 'created':
      return 'Đã tạo';
    case 'existing':
      return 'Đã dùng lại';
    case 'restored':
      return 'Đã khôi phục';
    case 'invalid':
      return 'Không thể xử lý';
  }
}
