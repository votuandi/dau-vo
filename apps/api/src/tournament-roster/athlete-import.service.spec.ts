import { BadRequestException } from '@nestjs/common';
import { AthleteImportService } from './athlete-import.service';

describe('AthleteImportService file parsing', () => {
  const service = new AthleteImportService({} as never);

  it('parses a five-column CSV without writing data', () => {
    const rows = service.parse({
      originalname: 'athletes.csv',
      buffer: Buffer.from(
        'Name,Year,Weight,Unit,Locality\nNguyen Van A,2000,55 kg,Club A,Ha Noi\n',
      ),
    } as Express.Multer.File);
    expect(rows).toEqual([
      {
        rowNumber: 2,
        name: 'Nguyen Van A',
        birthYear: 2000,
        weightClass: '55 kg',
        organizationName: 'Club A',
        organizationLocation: 'Ha Noi',
      },
    ]);
  });

  it('rejects files that do not have exactly five columns', () => {
    expect(() =>
      service.parse({
        originalname: 'athletes.csv',
        buffer: Buffer.from('a,b,c\n1,2,3\n'),
      } as Express.Multer.File),
    ).toThrow(BadRequestException);
  });
});
