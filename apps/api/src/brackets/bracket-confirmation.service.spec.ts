import { BracketFixtureStatus, BracketStatus } from '@prisma/client';
import { MatchDisplayState } from '@martial-arts-scoring/shared-types';
import type { PrismaService } from '../prisma/prisma.service';
import type { SportRulesRegistry } from '../sport-rules/sport-rules.registry';
import { BracketConfirmationService } from './bracket-confirmation.service';
import type { BracketPreviewService } from './bracket-preview.service';
import type { BracketPreviewTokenService } from './bracket-preview-token.service';

describe('BracketConfirmationService.find', () => {
  it.each([BracketStatus.ACTIVE, BracketStatus.COMPLETED])(
    'returns a %s bracket after a winner is chosen without an operational match',
    async (status) => {
      const winner = { id: 'winner-id', snapshotName: 'Winner' };
      const decision = {
        decisionType: 'WITHDRAWAL_OR_INJURY',
        reason: 'Opponent withdrew',
      };
      const record = {
        id: 'bracket-id',
        tournamentId: 'tournament-id',
        weightClassId: 'weight-class-id',
        status,
        championEntrant: status === BracketStatus.COMPLETED ? winner : null,
        entrants: [{ ...winner, athlete: { isSeed: false } }],
        fixtures: [
          {
            id: 'fixture-id',
            status: BracketFixtureStatus.COMPLETED,
            match: null,
            winnerEntrant: winner,
            winnerDecision: decision,
            slots: [],
          },
        ],
        roundStaffing: [],
      };
      const prisma = {
        tournamentBracket: { findFirst: jest.fn().mockResolvedValue(record) },
        tournamentOfficial: { count: jest.fn().mockResolvedValue(3) },
        $transaction: jest.fn((queries: Promise<unknown>[]) =>
          Promise.all(queries),
        ),
      };
      const service = new BracketConfirmationService(
        prisma as unknown as PrismaService,
        {} as BracketPreviewService,
        {} as BracketPreviewTokenService,
        {} as SportRulesRegistry,
      );

      const result = await service.find('tournament-id', 'weight-class-id');

      expect(result.fixtures[0]).toEqual(
        expect.objectContaining({
          displayState: MatchDisplayState.COMPLETED,
          match: null,
          winnerEntrant: winner,
          winnerDecision: decision,
        }),
      );
      expect(result.bracket.championEntrant).toEqual(record.championEntrant);
    },
  );
});
