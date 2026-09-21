import { Injectable } from '@nestjs/common';
import {
  MatchAppealScope,
  MatchAppealStatus,
  MatchOutcomeMethod,
  RoundStage,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertRoundDescriptor,
  type RoundDescriptor,
} from './round-descriptor';

/** Persistence-only boundary for V2 result records. Command authorization and
 * user-facing lifecycle behavior deliberately remain outside this phase. */
@Injectable()
export class MatchResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRound(
    tx: Prisma.TransactionClient,
    input: Omit<
      Prisma.RoundUncheckedCreateInput,
      'stage' | 'attemptNumber' | 'roundNumber'
    > & {
      descriptor: RoundDescriptor;
    },
  ) {
    const descriptor = assertRoundDescriptor(input.descriptor);
    const { descriptor: _descriptor, ...data } = input;
    return tx.round.create({
      data: {
        ...data,
        attemptNumber: descriptor.attemptNumber,
        roundNumber: descriptor.roundNumber,
        stage:
          descriptor.stage === 'REGULATION'
            ? RoundStage.REGULATION
            : RoundStage.OVERTIME,
      },
    });
  }

  async createFault(
    tx: Prisma.TransactionClient,
    data: Prisma.FaultUncheckedCreateInput,
  ) {
    return tx.fault.create({ data });
  }

  async createCompletedAppeal(
    tx: Prisma.TransactionClient,
    input: Omit<
      Prisma.MatchAppealUncheckedCreateInput,
      'scope' | 'attemptNumber' | 'status'
    > & {
      scope: 'REGULATION' | 'OVERTIME';
      attemptNumber: number;
      sourceRoundIds: [string, ...string[]];
    },
    adjustments: [
      Omit<Prisma.MatchAppealAdjustmentUncheckedCreateInput, 'appealId'>,
      Omit<Prisma.MatchAppealAdjustmentUncheckedCreateInput, 'appealId'>,
    ],
  ) {
    const { sourceRoundIds, ...appeal } = input;
    return tx.matchAppeal.create({
      data: {
        ...appeal,
        scope:
          input.scope === 'REGULATION'
            ? MatchAppealScope.REGULATION
            : MatchAppealScope.OVERTIME,
        status: MatchAppealStatus.COMPLETED,
        adjustments: { create: adjustments },
        sourceRounds: {
          create: sourceRoundIds.map((roundId) => ({ roundId })),
        },
      },
      include: { adjustments: true },
    });
  }

  async publishOutcome(
    tx: Prisma.TransactionClient,
    data: Prisma.MatchOutcomeUncheckedCreateInput,
  ) {
    return tx.matchOutcome.create({ data });
  }

  async invalidateAppeal(
    tx: Prisma.TransactionClient,
    appealId: string,
    invalidatedByAuditId: string,
  ) {
    return tx.matchAppeal.update({
      where: { id: appealId },
      data: {
        invalidatedAt: new Date(),
        invalidatedByAuditId,
        status: MatchAppealStatus.INVALIDATED,
      },
    });
  }

  static appealScope(descriptor: RoundDescriptor): {
    scope: MatchAppealScope;
    attemptNumber: number;
  } {
    const valid = assertRoundDescriptor(descriptor);
    return valid.stage === 'REGULATION'
      ? { scope: MatchAppealScope.REGULATION, attemptNumber: 0 }
      : {
          scope: MatchAppealScope.OVERTIME,
          attemptNumber: valid.attemptNumber,
        };
  }

  static readonly outcomeMethods = MatchOutcomeMethod;
}
