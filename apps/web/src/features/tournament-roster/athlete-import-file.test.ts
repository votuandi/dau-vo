import { describe, expect, it } from 'vitest';
import { AthleteImportFileError, parseAthleteImportFile } from './athlete-import-file';

function file(contents: string, name = 'athletes.csv'): File {
  return {
    name,
    text: () => Promise.resolve(contents),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(contents).buffer),
  } as File;
}

describe('parseAthleteImportFile', () => {
  it('accepts the established header and trims harmless whitespace', async () => {
    await expect(
      parseAthleteImportFile(
        file(
          'Họ và tên,Năm sinh,Hạng cân,Tên đơn vị tham gia,Địa phương đơn vị tham gia\n Nguyễn Văn A , 2000 , 55 kg , CLB A , Hà Nội \n',
        ),
      ),
    ).resolves.toEqual([
      {
        rowNumber: 2,
        name: 'Nguyễn Văn A',
        birthYear: 2000,
        weightClass: '55 kg',
        organizationName: 'CLB A',
        organizationLocation: 'Hà Nội',
      },
    ]);
  });

  it('keeps the first row as athlete data when it is not the exact header', async () => {
    await expect(
      parseAthleteImportFile(file('Nguyễn Văn A,2000,55 kg,CLB A,Hà Nội\n')),
    ).resolves.toEqual([
      {
        rowNumber: 1,
        name: 'Nguyễn Văn A',
        birthYear: 2000,
        weightClass: '55 kg',
        organizationName: 'CLB A',
        organizationLocation: 'Hà Nội',
      },
    ]);
  });

  it('reports the row and column for missing or ambiguous columns', async () => {
    await expect(parseAthleteImportFile(file('A,2000,55 kg,CLB A\n'))).rejects.toThrow(
      'dòng 1 phải có đúng 5 cột',
    );
    await expect(parseAthleteImportFile(file('A,2000,,CLB A,Hà Nội\n'))).rejects.toThrow(
      'dòng 1, cột 3',
    );
  });

  it('assigns unaffiliated athletes to “Không đơn vị” when their unit cell is blank', async () => {
    await expect(parseAthleteImportFile(file('A,2000,55 kg,,\n'))).resolves.toEqual([
      {
        rowNumber: 1,
        name: 'A',
        birthYear: 2000,
        weightClass: '55 kg',
        organizationName: 'Không đơn vị',
        organizationLocation: '',
      },
    ]);
  });

  it('rejects unsupported files', async () => {
    await expect(parseAthleteImportFile(file('x', 'athletes.txt'))).rejects.toBeInstanceOf(
      AthleteImportFileError,
    );
  });
});
