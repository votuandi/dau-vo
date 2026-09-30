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

  it.each(['', '   '])(
    'rejects an empty participating unit locality',
    async (organizationLocation) => {
      prisma.tournamentOrganization.findMany.mockResolvedValue([]);

      const result = await service.preview('tournament', [
        row({ organizationLocation }),
      ]);

      expect(result.results[0]).toMatchObject({
        status: 'invalid',
        unit: {
          status: 'invalid',
          errors: ['Địa phương của đơn vị tham gia là bắt buộc'],
        },
      });
    },
  );

  it('assigns a blank participating unit to “Không đơn vị” without requiring a locality', async () => {
    prisma.tournamentOrganization.findMany.mockResolvedValue([]);

    const result = await service.preview('tournament', [
      row({ organizationName: '', organizationLocation: '' }),
    ]);

    expect(result.results[0]).toMatchObject({
      status: 'eligible',
      unit: { name: 'Không đơn vị', locality: '', status: 'pending', errors: [] },
    });
  });

  it('reports a rolled-back created unit as invalid', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([]),
      tournament: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'DRAFT', softDeletedAt: null }),
      },
      athleteImportConfirmation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      tournamentWeightClass: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'weight', normalizedName: 'light' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tournamentOrganization: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({
            id: 'unit',
            isActive: true,
            name: 'Dojo One',
            location: 'Hanoi',
          }),
      },
      tournamentBracket: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      tournamentAthlete: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const transactionPrisma = {
      $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    };
    const transactionService = new AthleteImportService(
      transactionPrisma as never,
    );

    const { results } = await transactionService.confirm(
      'tournament',
      [row()],
      'admin',
      'key',
    );

    expect(results[0]).toMatchObject({
      status: 'failed',
      unit: {
        status: 'invalid',
        errors: ['Hạng cân không còn hoạt động'],
      },
      athlete: { status: 'failed' },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT athlete_import_0',
    );
  });

  it('reports a rolled-back restored unit as invalid', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([]),
      tournament: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'DRAFT', softDeletedAt: null }),
      },
      athleteImportConfirmation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      tournamentWeightClass: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'weight', normalizedName: 'light' }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tournamentOrganization: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              normalizedName: 'dojo one',
              normalizedLocation: 'hanoi',
              isActive: false,
            },
          ]),
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'unit',
            isActive: false,
            name: 'Dojo One',
            location: 'Hanoi',
          }),
        update: jest
          .fn()
          .mockResolvedValue({
            id: 'unit',
            isActive: true,
            name: 'Dojo One',
            location: 'Hanoi',
          }),
      },
      tournamentBracket: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      tournamentAthlete: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const transactionPrisma = {
      $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    };

    const { results } = await new AthleteImportService(
      transactionPrisma as never,
    ).confirm('tournament', [row()], 'admin', 'key');

    expect(results[0]).toMatchObject({
      status: 'failed',
      unit: { status: 'invalid', errors: ['Hạng cân không còn hoạt động'] },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT athlete_import_0',
    );
  });
});
