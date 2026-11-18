import {
  AthleteColor,
  MatchStatus,
  RoundStage,
  FaultSeverity,
} from '@prisma/client';
import { FaultService } from './fault.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupervisorAuthorizationService } from './supervisor-authorization.service';
import { FaultRoundEndedError } from './fault.errors';

describe('supervisor score adjustments', () => {
  function setup(
    status: MatchStatus = MatchStatus.ROUND_1_RUNNING,
    endsAt = new Date('2030-01-01'),
  ) {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'match' }])
        .mockResolvedValueOnce([{ serverNow: new Date('2026-01-01') }]),
      match: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          currentRound: 1,
          publicId: 'M1',
          status,
          rounds: [
            {
              id: 'round',
              roundNumber: 1,
              stage: RoundStage.REGULATION,
              endsAt,
              pausedAt:
                status === MatchStatus.ROUND_1_PAUSED
                  ? new Date('2025-12-31T23:59:50Z')
                  : null,
              durationMs: 60_000,
              remainingDurationMs:
                status === MatchStatus.ROUND_1_PAUSED ? 40_000 : null,
            },
          ],
        }),
      },
      matchAthlete: {
        findUnique: jest.fn().mockResolvedValue({ id: 'athlete' }),
      },
      scoreEvent: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const authorization = {
      lockAndVerify: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FaultService(
      prisma as unknown as PrismaService,
      authorization as unknown as SupervisorAuthorizationService,
    );
    const input = {
      athlete: AthleteColor.RED,
      value: -1 as const,
      matchId: 'match',
      identity: {
        kind: 'legacy' as const,
        sessionId: 'session',
        sessionTokenHash: 'hash',
      },
    };
    return { tx, authorization, service, input };
  }
  it('records a signed adjustment and actor audit in the active round', async () => {
    const { tx, authorization, service, input } = setup();
    await service.adjustScore(input);
    expect(authorization.lockAndVerify).toHaveBeenCalled();
    expect(tx.scoreEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'ADMIN_ADJUSTMENT',
        value: -1,
        roundId: 'round',
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          action: 'SUPERVISOR_SCORE_ADJUSTED',
          value: -1,
        }),
      }),
    });
  });
  it('accepts paused adjustments after the original deadline and records the frozen elapsed time', async () => {
    const { tx, service, input } = setup(
      MatchStatus.ROUND_1_PAUSED,
      new Date('2025-12-31'),
    );
    await service.adjustScore(input);
    expect(tx.scoreEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ value: -1, roundElapsedMs: 20_000 }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ recordedWhilePaused: true }),
      }),
    });
  });
  it.each([FaultSeverity.MINOR, FaultSeverity.MAJOR])(
    'records %s faults while paused',
    async (severity) => {
      const { tx, service, input } = setup(
        MatchStatus.ROUND_1_PAUSED,
        new Date('2025-12-31'),
      );
      Object.assign(tx.matchAthlete, {
        findMany: jest.fn().mockResolvedValue([]),
      });
      Object.assign(tx.scoreEvent, {
        findMany: jest.fn().mockResolvedValue([]),
      });
      Object.assign(tx, {
        fault: {
          create: jest
            .fn()
            .mockResolvedValue({
              id: 'fault',
              createdAt: new Date(),
              severity,
            }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        round: { findMany: jest.fn().mockResolvedValue([{ id: 'round' }]) },
      });
      tx.auditLog.create.mockResolvedValue({ id: 'audit' });
      await service.record({ ...input, severity });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'FAULT_RECORDED',
            recordedWhilePaused: true,
          }),
        }),
        select: { id: true },
      });
    },
  );
  it('rejects rounds whose server deadline has passed', async () => {
    const { tx, service, input } = setup(
      MatchStatus.ROUND_1_RUNNING,
      new Date('2025-01-01'),
    );
    await expect(service.adjustScore(input)).rejects.toBeInstanceOf(
      FaultRoundEndedError,
    );
    expect(tx.scoreEvent.create).not.toHaveBeenCalled();
  });
  it('rejects stale supervisor identities before writing points', async () => {
    const { tx, authorization, service, input } = setup();
    authorization.lockAndVerify.mockRejectedValue(new Error('stale'));
    await expect(service.adjustScore(input)).rejects.toThrow('stale');
    expect(tx.scoreEvent.create).not.toHaveBeenCalled();
  });
});
