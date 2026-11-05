import { AthleteColor, BracketFixtureStatus, BracketStatus, MatchLifecycle, MatchStatus } from '@prisma/client';

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
      'ADMIN_TIEBREAK',
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

  it('advances a withdrawal/injury decision before a match is prepared', async () => {
    const winnerId = '33333333-3333-4333-8333-333333333333';
    const otherId = '44444444-4444-4444-8444-444444444444';
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bracketWinnerDecisionIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      bracketFixture: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce({
            id: fixtureId,
            status: BracketFixtureStatus.READY,
            match: null,
            slots: [
              { resolvedEntrantId: winnerId },
              { resolvedEntrantId: otherId },
            ],
            winnerDecision: null,
          })
          .mockResolvedValueOnce({
            id: fixtureId,
            bracketId: '55555555-5555-4555-8555-555555555555',
            roundNumber: 1,
            winnerEntrantId: null,
            bracket: { roundCount: 2 },
            match: null,
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
      'athlete withdrew after injury',
      'withdrawal-key',
      'WITHDRAWAL_OR_INJURY',
    );

    expect(tx.bracketFixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BracketFixtureStatus.COMPLETED,
          winnerDecision: expect.objectContaining({
            decisionType: 'WITHDRAWAL_OR_INJURY',
          }),
        }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            decisionType: 'WITHDRAWAL_OR_INJURY',
          }),
        }),
      }),
    );
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
          slots: [
            { resolvedEntrantId: '33333333-3333-4333-8333-333333333333' },
          ],
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
        'ADMIN_TIEBREAK',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BRACKET_FIXTURE_PARTICIPANTS_UNRESOLVED' },
    });
  });
  it('replaces a completed winner, resets the affected bracket path and retains downstream matches', async () => {
    const winnerId = '33333333-3333-4333-8333-333333333333';
    const otherId = '44444444-4444-4444-8444-444444444444';
    const bracketId = '55555555-5555-4555-8555-555555555555';
    const childFixtureId = '77777777-7777-4777-8777-777777777777';
    const downstreamMatchId = '88888888-8888-4888-8888-888888888888';
    const downstreamSlot = {
      id: '99999999-9999-4999-8999-999999999999',
      fixtureId: childFixtureId,
      resolvedEntrantId: otherId as string | null,
      fixture: { match: { id: downstreamMatchId } },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bracketWinnerDecisionIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      bracketFixture: {
        findUniqueOrThrow: jest.fn()
          .mockResolvedValueOnce({
            id: fixtureId,
            status: BracketFixtureStatus.COMPLETED,
            bracket: { status: BracketStatus.COMPLETED },
            match: null,
            slots: [{ resolvedEntrantId: winnerId }, { resolvedEntrantId: otherId }],
            winnerDecision: { decisionType: 'RULES' },
          })
          .mockResolvedValueOnce({
            id: fixtureId,
            bracketId,
            roundNumber: 1,
            winnerEntrantId: otherId,
            bracket: { status: BracketStatus.COMPLETED, roundCount: 2 },
            match: null,
          }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bracketSlot: {
        findMany: jest.fn().mockImplementation(({ where }: {
          where: { sourceFixtureId?: string; fixtureId?: string };
        }) => {
          if (where.sourceFixtureId === fixtureId) return [downstreamSlot];
          if (where.fixtureId === childFixtureId) return [
            { resolvedEntrantId: winnerId },
            { resolvedEntrantId: otherId },
          ];
          return [];
        }),
        update: jest.fn().mockImplementation(({ where, data }: {
          where: { id: string };
          data: { resolvedEntrantId: string | null };
        }) => {
          if (where.id === downstreamSlot.id)
            downstreamSlot.resolvedEntrantId = data.resolvedEntrantId;
          return Promise.resolve({});
        }),
      },
      match: { update: jest.fn().mockResolvedValue({}) },
      tournamentBracket: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new BracketOutcomeService({} as never);

    await service.manuallyDecide(
      tx as never, fixtureId, winnerId,
      '66666666-6666-4666-8666-666666666666',
      'correct official result', 'corrected-winner-key', 'ADMIN_OVERRIDE',
    );

    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: downstreamMatchId },
      data: { bracketFixtureId: null },
    });
    expect(tx.bracketFixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: fixtureId },
        data: expect.objectContaining({
          winnerEntrantId: winnerId,
          status: BracketFixtureStatus.COMPLETED,
        }),
      }),
    );
    expect(tx.tournamentBracket.update).toHaveBeenCalledWith({
      where: { id: bracketId },
      data: {
        status: BracketStatus.ACTIVE,
        completedAt: null,
        championEntrantId: null,
      },
    });
  });

  it('supports correcting an already finished standalone match with an audited result', async () => {
    const red = { id: '33333333-3333-4333-8333-333333333333', color: AthleteColor.RED };
    const blue = { id: '44444444-4444-4444-8444-444444444444', color: AthleteColor.BLUE };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      match: {
        findUniqueOrThrow: jest.fn()
          .mockResolvedValueOnce({
            id: matchId,
            bracketFixtureId: null,
            athletes: [red, blue],
          })
          .mockResolvedValueOnce({
            id: matchId,
            status: MatchStatus.FINISHED,
            lifecycle: MatchLifecycle.COMPLETED,
            finishedAt: new Date('2026-11-01T00:00:00.000Z'),
            outcome: {
              winnerColor: AthleteColor.RED,
              method: 'REGULATION_SCORE',
              publishedAt: new Date('2026-11-01T00:00:00.000Z'),
            },
            athletes: [red, blue],
          }),
        update: jest.fn().mockResolvedValue({}),
      },
      matchWinnerDecisionIdempotency: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      matchOutcome: { upsert: jest.fn().mockResolvedValue({}) },
      round: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      scoringWindow: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      matchOfficialAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new BracketOutcomeService({} as never);

    await service.manuallyDecideMatch(
      tx as never, matchId, AthleteColor.BLUE,
      '66666666-6666-4666-8666-666666666666',
      'official correction', 'standalone-override-key',
    );

    expect(tx.matchOutcome.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId },
        update: expect.objectContaining({
          winnerColor: AthleteColor.BLUE,
          method: 'ADMIN_MANUAL',
          sourceAppealId: null,
        }),
      }),
    );
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: matchId },
      data: expect.objectContaining({
        status: MatchStatus.FINISHED,
        lifecycle: MatchLifecycle.COMPLETED,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ action: 'ADMIN_MANUAL_WINNER' }),
      }),
    });
  });

});
