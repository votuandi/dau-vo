import type { PrismaService } from '../prisma/prisma.service';
import type { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import type { BracketPreviewService } from './bracket-preview.service';
import type { BracketDrawSetupTokenService } from './bracket-draw-setup-token.service';
import { BracketDrawSetupService } from './bracket-draw-setup.service';

const tournamentId = '11111111-1111-4111-8111-111111111111';
const weightClassId = '22222222-2222-4222-8222-222222222222';

function subject(count: number) {
  const athletes = Array.from({ length: count }, (_, i) => ({
    id: `athlete-${i + 1}`,
    name: `Athlete ${i + 1}`,
    imagePath: null,
    isActive: true,
    weightClassId,
    updatedAt: new Date(),
    organizationId: null,
    organization: null,
  }));
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
    tournamentAthlete: { findMany: jest.fn().mockResolvedValue(athletes) },
  };
  const token = {
    issue: jest.fn().mockReturnValue({
      setupToken: 'setup-token',
      expiresAt: '2026-09-12T00:05:00.000Z',
    }),
  };
  const service = new BracketDrawSetupService(
    prisma as unknown as PrismaService,
    {
      resolve: jest.fn().mockReturnValue({ athleteColors: ['RED', 'BLUE'] }),
    } as unknown as SportRulesRegistry,
    {
      rosterFingerprint: jest.fn().mockReturnValue('a'.repeat(64)),
    } as unknown as BracketPreviewService,
    token as unknown as BracketDrawSetupTokenService,
  );
  return { prisma, token, service };
}

describe('BracketDrawSetupService', () => {
  it('returns the complete authoritative roster without randomization or writes', async () => {
    const { prisma, token, service } = subject(33);
    const result = await service.setup(tournamentId, weightClassId);
    expect(result.eligibleAthletes).toHaveLength(33);
    expect(result.summary).toMatchObject({
      athleteCount: 33,
      bracketSize: 64,
      firstRoundFixtureCount: 1,
      byeCount: 31,
    });
    expect(prisma.tournamentAthlete.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: expect.anything() }),
    );
    expect(token.issue).toHaveBeenCalled();
    expect(Object.keys(prisma)).not.toContain('auditLog');
    expect(Object.keys(prisma)).not.toContain('$transaction');
  });

  it('rejects a bounded-overflow roster with a stable domain error', async () => {
    const { service } = subject(65);
    await expect(
      service.setup(tournamentId, weightClassId),
    ).rejects.toMatchObject({
      response: { code: 'BRACKET_ATHLETE_LIMIT_EXCEEDED' },
    });
  });
});
