import { NotFoundException } from '@nestjs/common';

import type { BracketConfirmationService } from '../brackets/bracket-confirmation.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  TournamentWatchService,
  normalizeTournamentCode,
} from './tournament-watch.service';

describe('normalizeTournamentCode', () => {
  it('trims and upper-cases a code', () => {
    expect(normalizeTournamentCode('  ab23cd  ')).toBe('AB23CD');
  });

  it.each(['', '   ', 'AB-CD', 'a'.repeat(33), "AB' OR 1=1"])(
    'rejects %p',
    (code) => {
      expect(normalizeTournamentCode(code)).toBeNull();
    },
  );
});

describe('TournamentWatchService', () => {
  const tournament = {
    id: 't-1',
    publicCode: 'ABC234',
    name: 'Giải mở rộng',
    description: null,
    location: 'Hà Nội',
    startDate: null,
    endDate: null,
    status: 'ACTIVE',
    imagePath: 'tournaments/logo.webp',
    sport: { name: 'Vovinam' },
  };

  function setup(found: typeof tournament | null = tournament) {
    const prisma = {
      tournament: { findFirst: jest.fn().mockResolvedValue(found) },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      tournamentWeightClass: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'w-1', name: 'Nam 54kg' },
          { id: 'w-2', name: 'Nữ 48kg' },
        ]),
      },
    };
    const brackets = {
      listCurrent: jest.fn().mockResolvedValue([
        {
          bracket: { id: 'b-1', weightClassId: 'w-1' },
          entrants: [],
          fixtures: [],
          staffing: [{ roundNumber: 1 }],
        },
      ]),
    };
    const service = new TournamentWatchService(
      prisma as unknown as PrismaService,
      brackets as unknown as BracketConfirmationService,
    );
    return { prisma, brackets, service };
  }

  it('looks the tournament up by its normalized code, excluding archived and deleted ones', async () => {
    const { prisma, service } = setup();
    const result = await service.overview(' abc234 ');
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicCode: 'ABC234',
          softDeletedAt: null,
          status: { not: 'ARCHIVED' },
        },
      }),
    );
    expect(result.tournament).not.toHaveProperty('id');
    expect(result.tournament.imageUrl).toBe('/api/media/tournaments/logo.webp');
  });

  it('answers 404 for an unknown or malformed code without querying', async () => {
    const { prisma, service } = setup(null);
    await expect(service.overview('NOPE')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.overview('bad-code')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.tournament.findFirst).toHaveBeenCalledTimes(1);
  });

  it('pairs each active weight class with its current bracket and hides round settings', async () => {
    const { service } = setup();
    const { weightClasses } = await service.brackets('ABC234');
    expect(weightClasses).toEqual([
      {
        id: 'w-1',
        name: 'Nam 54kg',
        bracket: {
          bracket: { id: 'b-1', weightClassId: 'w-1' },
          entrants: [],
          fixtures: [],
        },
      },
      { id: 'w-2', name: 'Nữ 48kg', bracket: null },
    ]);
  });
});
