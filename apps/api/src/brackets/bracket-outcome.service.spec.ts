import { BracketFixtureStatus } from '@prisma/client';

import { BracketOutcomeService } from './bracket-outcome.service';

const fixtureId = '11111111-1111-4111-8111-111111111111';
const matchId = '22222222-2222-4222-8222-222222222222';

describe('BracketOutcomeService retraction', () => {
  it('retracts an awaiting tie decision so a replay can be evaluated', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      bracketFixture: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: fixtureId,
          bracketId: '33333333-3333-4333-8333-333333333333',
          roundNumber: 1,
          status: BracketFixtureStatus.AWAITING_WINNER,
          winnerEntrantId: null,
          winnerDecision: { decisionType: 'RULES_TIE', scoreSnapshot: {} },
          bracket: { roundCount: 2 },
          sourceSlots: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      bracketSlot: { findMany: jest.fn().mockResolvedValue([]) },
      match: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          bracketFixtureId: fixtureId,
        }),
      },
      tournamentBracket: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new BracketOutcomeService({} as never);

    await service.retractFinishedMatch(tx as never, matchId, {
      sessionId: 'session',
      reason: 'MATCH_RESET',
    });

    expect(tx.bracketFixture.update).toHaveBeenCalledWith({
      where: { id: fixtureId },
      data: {
        winnerEntrantId: null,
        winnerDecision: expect.anything(),
        status: BracketFixtureStatus.MATCH_PREPARED,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matchId }),
      }),
    );
    expect(tx.tournamentBracket.update).not.toHaveBeenCalled();
  });

  it('does not retract an outcome for a standalone match', async () => {
    const tx = {
      match: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          bracketFixtureId: null,
        }),
      },
    };
    const service = new BracketOutcomeService({} as never);

    await service.retractFinishedMatch(tx as never, matchId, {
      reason: 'MATCH_RESET',
    });

    expect(tx.match.findUniqueOrThrow).toHaveBeenCalled();
  });
});
