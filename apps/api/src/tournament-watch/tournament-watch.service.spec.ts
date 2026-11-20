import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { BracketConfirmationService } from '../brackets/bracket-confirmation.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  TournamentWatchService,
  manualDecisionView,
  normalizeTournamentCode,
} from './tournament-watch.service';

describe('manualDecisionView', () => {
  it('keeps organiser decisions and drops rule-based results', () => {
    expect(
      manualDecisionView({
        decisionType: 'WITHDRAWAL_OR_INJURY',
        reason: 'Chấn thương',
      }),
    ).toEqual({ type: 'WITHDRAWAL_OR_INJURY', reason: 'Chấn thương' });
    expect(
      manualDecisionView({ decisionType: 'ADMIN_OVERRIDE', reason: '  ' }),
    ).toEqual({
      type: 'ADMIN_OVERRIDE',
      reason: null,
    });
    expect(manualDecisionView({ decisionType: 'RULES' })).toBeNull();
    expect(manualDecisionView(null)).toBeNull();
    expect(manualDecisionView([1])).toBeNull();
  });
});

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
    allowLiveWatch: true,
    sport: { name: 'Vovinam' },
  };

  function setup(found: typeof tournament | null = tournament) {
    const prisma = {
      tournament: { findFirst: jest.fn().mockResolvedValue(found) },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      bracketFixture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'f-1',
            roundNumber: 1,
            position: 13,
            displayReference: 'R1-M13',
            winnerDecision: {
              decisionType: 'WITHDRAWAL_OR_INJURY',
              reason: 'Bỏ cuộc',
            },
            winnerEntrantId: 'e-blue',
            createdAt: new Date('2026-11-20T08:00:00Z'),
            updatedAt: new Date('2026-11-20T09:00:00Z'),
            bracket: {
              roundCount: 3,
              weightClass: { id: 'w-1', name: 'Nam 54kg' },
            },
            slots: [
              {
                side: 'RED',
                resolvedEntrant: {
                  id: 'e-red',
                  snapshotName: 'An',
                  snapshotOrganization: null,
                  snapshotImagePath: null,
                },
              },
              {
                side: 'BLUE',
                resolvedEntrant: {
                  id: 'e-blue',
                  snapshotName: 'Bình',
                  snapshotOrganization: 'CLB A',
                  snapshotImagePath: 'athletes/b.webp',
                },
              },
            ],
          },
        ]),
      },
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

  it('lists fixtures decided without a match as finished matches with a manual decision', async () => {
    const { prisma, service } = setup();
    const { matches } = await service.overview('ABC234');
    expect(prisma.bracketFixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED', match: null }),
      }),
    );
    expect(matches).toEqual([
      expect.objectContaining({
        kind: 'DECIDED_FIXTURE',
        id: 'f-1',
        publicId: null,
        lifecycle: 'COMPLETED',
        score: null,
        winnerColor: 'BLUE',
        weightClass: { id: 'w-1', name: 'Nam 54kg' },
        bracketRound: expect.objectContaining({
          displayReference: 'R1-M13',
          label: 'Tứ kết',
        }),
        manualDecision: { type: 'WITHDRAWAL_OR_INJURY', reason: 'Bỏ cuộc' },
        athletes: [
          { color: 'RED', name: 'An', organization: null, imageUrl: null },
          {
            color: 'BLUE',
            name: 'Bình',
            organization: 'CLB A',
            imageUrl: '/api/media/athletes/b.webp',
          },
        ],
      }),
    ]);
  });

  it('refuses every view of a tournament that does not allow live watching', async () => {
    const { prisma, service } = setup({ ...tournament, allowLiveWatch: false });
    for (const view of [
      () => service.overview('ABC234'),
      () => service.brackets('ABC234'),
      () => service.matchResult('ABC234', 'M1'),
    ])
      await expect(view()).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'WATCH_LIVE_WATCH_DISABLED' },
      });
    expect(prisma.match.findMany).not.toHaveBeenCalled();
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
