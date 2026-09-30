import { BadRequestException } from '@nestjs/common';
import { AthleteImportService } from './athlete-import.service';

const row = (overrides = {}) => ({
  rowNumber: 2,
  name: 'Nguyen Van A',
  birthYear: 2000,
  weightClass: 'Light',
  organizationName: 'Dojo One',
  organizationLocation: 'Hanoi',
  ...overrides,
});

describe('AthleteImportService', () => {
  const prisma = {
    tournamentWeightClass: { findMany: jest.fn() },
    tournamentOrganization: { findMany: jest.fn() },
    tournamentBracket: { findMany: jest.fn() },
    tournamentAthlete: { findMany: jest.fn() },
  };
  const service = new AthleteImportService(prisma as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.tournamentWeightClass.findMany.mockResolvedValue([
      { id: 'weight', normalizedName: 'light' },
    ]);
    prisma.tournamentBracket.findMany.mockResolvedValue([]);
    prisma.tournamentAthlete.findMany.mockResolvedValue([]);
  });

  it('rejects duplicate spreadsheet row numbers before preview validation', async () => {
    await expect(
      service.preview('tournament', [row(), row({ name: 'B' })]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tournamentWeightClass.findMany).not.toHaveBeenCalled();
  });

  it('distinguishes active and inactive units by normalized name and locality', async () => {
    prisma.tournamentOrganization.findMany.mockResolvedValue([
      {
        normalizedName: 'dojo one',
        normalizedLocation: 'hanoi',
        isActive: true,
      },
      {
        normalizedName: 'dojo one',
        normalizedLocation: 'danang',
        isActive: false,
      },
    ]);
    const result = await service.preview('tournament', [
      row(),
      row({ rowNumber: 3, name: 'B', organizationLocation: 'Danang' }),
      row({ rowNumber: 4, name: 'C', organizationLocation: 'Hue' }),
    ]);
    expect(result.results.map((item) => item.unit.status)).toEqual([
      'existing',
      'restored',
      'pending',
    ]);
  });

  it('keeps a valid unit outcome when its athlete data is invalid', async () => {
    prisma.tournamentOrganization.findMany.mockResolvedValue([
      {
        normalizedName: 'dojo one',
        normalizedLocation: 'hanoi',
        isActive: true,
      },
    ]);
    const result = await service.preview('tournament', [
      row({ birthYear: 1800 }),
    ]);
    expect(result.results[0]).toMatchObject({
      status: 'invalid',
      unit: { status: 'existing', errors: [] },
      athlete: { status: 'invalid' },
    });
  });
});
