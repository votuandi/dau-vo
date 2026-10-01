import { BracketFixtureStatus, MatchStatus } from '@prisma/client';

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

  it('persists an authorized manual decision with its actor, match, and reason', async () => {
    const winnerId = '33333333-3333-4333-8333-333333333333';
    const otherId = '44444444-4444-4444-8444-444444444444';
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bracketWinnerDecisionIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      bracketFixture: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({
            id: fixtureId,
            status: BracketFixtureStatus.AWAITING_WINNER,
            match: { id: matchId, status: MatchStatus.FINISHED },
            slots: [
              { resolvedEntrantId: winnerId },
              { resolvedEntrantId: otherId },
            ],
            winnerDecision: { scoreSnapshot: { effectiveTotals: {} } },
          })
          .mockResolvedValueOnce({
            id: fixtureId,
            bracketId: '55555555-5555-4555-8555-555555555555',
            roundNumber: 1,
            winnerEntrantId: null,
            bracket: { roundCount: 2 },
            match: { id: matchId },
          }),
        update: jest.fn().mockResolvedValue({}),
      },
      bracketSlot: { findMany: jest.fn().mockResolvedValue([]) },
      tournamentBracket: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new BracketOutcomeService({} as never);

    await service.manuallyDecide(
      tx as never,
      fixtureId,
      winnerId,
      '66666666-6666-4666-8666-666666666666',
      'medical withdrawal',
      'manual-winner-key',
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: '66666666-6666-4666-8666-666666666666',
        matchId,
        eventType: 'BRACKET_WINNER_MANUALLY_DECIDED',
        metadata: expect.objectContaining({
          fixtureId,
          entrantId: winnerId,
          reason: 'medical withdrawal',
        }),
      }),
    });
    expect(tx.bracketWinnerDecisionIdempotency.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a manual decision when either fixture participant is unresolved', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bracketWinnerDecisionIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      bracketFixture: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          status: BracketFixtureStatus.AWAITING_WINNER,
          match: { id: matchId, status: MatchStatus.FINISHED },
          slots: [{ resolvedEntrantId: '33333333-3333-4333-8333-333333333333' }],
        }),
      },
      bracketSlot: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BracketOutcomeService({} as never);

    await expect(
      service.manuallyDecide(
        tx as never,
        fixtureId,
        '33333333-3333-4333-8333-333333333333',
        '66666666-6666-4666-8666-666666666666',
        'medical withdrawal',
        'manual-winner-key',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BRACKET_FIXTURE_PARTICIPANTS_UNRESOLVED' },
    });
  });
});
