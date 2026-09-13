import type { PrismaService } from '../prisma/prisma.service';
import type { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import type { BracketPreviewTokenService } from './bracket-preview-token.service';
import { BracketPreviewService } from './bracket-preview.service';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const weightClassId = '22222222-2222-4222-8222-222222222222';

function athlete(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Athlete ${index}`,
    birthYear: 2000,
    imagePath: null,
    isActive: true,
    weightClassId,
    updatedAt: new Date('2026-09-12T00:00:00.000Z'),
    organizationId: null,
    organization: null,
  };
}

function subject(count: number) {
  const prisma = {
    tournament: {
      findFirst: jest.fn().mockResolvedValue({
        status: 'DRAFT',
        sport: { sportGroup: { code: 'ONE_ON_ONE_COMBAT' } },
      }),
    },
    tournamentWeightClass: {
      findFirst: jest.fn().mockResolvedValue({ id: weightClassId }),
    },
    tournamentBracket: { findFirst: jest.fn().mockResolvedValue(null) },
    tournamentAthlete: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: count }, (_, index) => athlete(index + 1)),
        ),
    },
  };
  const rules = {
    resolve: jest.fn().mockReturnValue({ athleteColors: ['RED', 'BLUE'] }),
  };
  const tokens = {
    issue: jest.fn().mockReturnValue({
      previewToken: 'opaque-token',
      expiresAt: '2026-09-12T00:05:00.000Z',
    }),
  };
  return {
    prisma,
    service: new BracketPreviewService(
      prisma as unknown as PrismaService,
      rules as unknown as SportRulesRegistry,
      tokens as unknown as BracketPreviewTokenService,
    ),
  };
}

describe('BracketPreviewService', () => {
  it.each([
    [2, 2, 0, 1, 1],
    [29, 32, 3, 5, 28],
    [31, 32, 1, 5, 30],
    [32, 32, 0, 5, 31],
    [64, 64, 0, 6, 63],
  ])(
    'previews %i eligible athletes without a persistence write',
    async (count, bracketSize, byeCount, roundCount, totalFixtureCount) => {
      const { prisma, service } = subject(count);
      const result = await service.preview(tournamentId, weightClassId);

      expect(result.summary).toEqual({
        athleteCount: count,
        bracketSize,
        byeCount,
        roundCount,
        totalFixtureCount,
      });
      expect(result.previewToken).toBe('opaque-token');
      expect(result.initialEntrants).toHaveLength(bracketSize);
      expect(
        prisma.tournamentAthlete.findMany.mock.calls[0]?.[0],
      ).not.toHaveProperty('take');
      expect(Object.keys(prisma)).not.toContain('auditLog');
    },
  );

  it('creates a stable fingerprint independent of query order', () => {
    const { service } = subject(2);
    const entrants = [athlete(1), athlete(2)];
    expect(service.rosterFingerprint(entrants)).toBe(
      service.rosterFingerprint([...entrants].reverse()),
    );
  });
});
