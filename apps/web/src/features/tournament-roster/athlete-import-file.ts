import * as XLSX from 'xlsx';
import type { AthleteImportRow } from '@/services/api/admin-management';

const supportedExtensions = ['xlsx', 'xls', 'csv'] as const;
const header = [
  'Họ và tên',
  'Năm sinh',
  'Hạng cân',
  'Tên đơn vị tham gia',
  'Địa phương đơn vị tham gia',
] as const;
const noOrganizationName = 'Không đơn vị';

export class AthleteImportFileError extends Error {}

function trimmed(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function isEmpty(row: readonly unknown[]): boolean {
  return row.every((cell) => trimmed(cell) === '');
}

function hasExpectedHeader(row: readonly unknown[]): boolean {
  return (
    row.length === header.length && row.every((cell, index) => trimmed(cell) === header[index])
  );
}

export async function parseAthleteImportFile(file: File): Promise<readonly AthleteImportRow[]> {
  const extension = /\.([^.]+)$/u.exec(file.name.toLowerCase())?.[1];
  if (
    !extension ||
    !supportedExtensions.includes(extension as (typeof supportedExtensions)[number])
  ) {
    throw new AthleteImportFileError(
      'Tệp không hợp lệ: chỉ chấp nhận một tệp .xlsx, .xls hoặc .csv.',
    );
  }

  let rows: unknown[][];
  try {
    const workbook =
      extension === 'csv'
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    if (!sheet) throw new Error('missing worksheet');
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true });
  } catch {
    throw new AthleteImportFileError('Tệp không hợp lệ: không thể đọc nội dung bảng tính.');
  }

  while (rows.length > 0 && isEmpty(rows[rows.length - 1] ?? [])) rows.pop();
  if (rows.length === 0)
    throw new AthleteImportFileError('Tệp không hợp lệ: tệp không có dòng vận động viên nào.');

  const start = hasExpectedHeader(rows[0] ?? []) ? 1 : 0;
  const parsed: AthleteImportRow[] = [];
  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const rowNumber = index + 1;
    if (isEmpty(row)) {
      throw new AthleteImportFileError(
        `Tệp không hợp lệ: dòng ${String(rowNumber)} trống ở giữa dữ liệu.`,
      );
    }
    if (row.length !== 5) {
      throw new AthleteImportFileError(
        `Tệp không hợp lệ: dòng ${String(rowNumber)} phải có đúng 5 cột (hiện có ${String(row.length)} cột).`,
      );
    }
    const values = row.map(trimmed);
    // A blank participating-unit cell represents an unaffiliated athlete.
    // Its locality is consequently optional as well.
    const missingColumn = values.findIndex(
      (value, columnIndex) =>
        value === '' && columnIndex !== 3 && !(columnIndex === 4 && values[3] === ''),
    );
    if (missingColumn !== -1) {
      throw new AthleteImportFileError(
        `Tệp không hợp lệ: dòng ${String(rowNumber)}, cột ${String(missingColumn + 1)} (${header[missingColumn] ?? ''}) đang để trống.`,
      );
    }
    const birthYear = Number(values[1]);
    if (!/^\d{4}$/u.test(values[1] ?? '') || !Number.isInteger(birthYear)) {
      throw new AthleteImportFileError(
        `Tệp không hợp lệ: dòng ${String(rowNumber)}, cột 2 (Năm sinh) phải là năm gồm 4 chữ số.`,
      );
    }
    parsed.push({
      rowNumber,
      name: values[0] ?? '',
      birthYear,
      weightClass: values[2] ?? '',
      organizationName: values[3] === '' ? noOrganizationName : (values[3] ?? noOrganizationName),
      organizationLocation: values[4] ?? '',
    });
  }
  if (parsed.length === 0)
    throw new AthleteImportFileError(
      'Tệp không hợp lệ: chỉ có hàng tiêu đề, chưa có vận động viên.',
    );
  return parsed;
}

export const athleteImportHeaderHelp = header.join(' | ');
