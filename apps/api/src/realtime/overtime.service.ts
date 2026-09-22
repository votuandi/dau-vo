import { Inject, Injectable } from '@nestjs/common';
import {
  AthleteColor,
  AuditEventType,
  MatchAppealScope,
  MatchLifecycle,
  MatchRulesVersion,
  MatchStatus,
  RoundStage,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { auditActor, type InspectorCommandIdentity } from './command-identity';
import { InspectorAuthorizationService } from './inspector-authorization.service';
import {
  AppealIdentityError,
  AppealIdempotencyError,
  AppealStateError,
  RegulationAppealService,
  type RegulationAppealInput,
} from './regulation-appeal.service';
import { finalScore } from './result-calculations';

export type OvertimeAppealTransition = {
  appealId: string;
  matchId: string;
  matchPublicId: string;
  phase: MatchStatus;
  attemptNumber: number;
  isTie: boolean;
};

@Injectable()
export class OvertimeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RegulationAppealService)
    private readonly appeals: RegulationAppealService,
    @Inject(InspectorAuthorizationService)
    private readonly inspectorAuthorization: InspectorAuthorizationService,
  ) {}

  async complete(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
    payload: RegulationAppealInput;
  }): Promise<OvertimeAppealTransition> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockMatch(tx, input.matchId);
        await this.inspectorAuthorization.lockAndVerify(
          tx,
          input.matchId,
          input.identity,
          new AppealIdentityError('Inspector assignment or session is stale'),
        );
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: {
            publicId: true,
            status: true,
            lifecycle: true,
            rulesVersion: true,
          },
        });
        const existing = await tx.matchAppeal.findFirst({
          where: { idempotencyKey: input.payload.idempotencyKey },
          include: {
            adjustments: { include: { athlete: { select: { color: true } } } },
          },
        });
        if (existing) {
          const adjustments = new Map(
            existing.adjustments.map((adjustment) => [
              adjustment.athlete.color,
              adjustment,
            ]),
          );
          const red = adjustments.get(AthleteColor.RED);
          const blue = adjustments.get(AthleteColor.BLUE);
          if (
            existing.matchId !== input.matchId ||
            existing.scope !== MatchAppealScope.OVERTIME ||
            red === undefined ||
            blue === undefined ||
            red.bonusPoints !== input.payload.RED.bonusPoints ||
            red.penaltyPoints !== input.payload.RED.penaltyPoints ||
            blue.bonusPoints !== input.payload.BLUE.bonusPoints ||
            blue.penaltyPoints !== input.payload.BLUE.penaltyPoints
          )
            throw new AppealIdempotencyError(
              'Idempotency key was previously used with a different appeal payload',
            );
          const isTie = red.finalScore === blue.finalScore;
          return {
            appealId: existing.id,
            matchId: input.matchId,
            matchPublicId: match.publicId,
            phase: isTie
              ? MatchStatus.OVERTIME_TIEBREAK_DECISION
              : MatchStatus.RESULT_PUBLICATION_READY,
            attemptNumber: existing.attemptNumber,
            isTie,
          };
        }
        if (match.rulesVersion !== MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2)
          throw new AppealStateError(
            'Overtime is unavailable for legacy matches',
          );
        if (
          match.status !== MatchStatus.OVERTIME_APPEAL ||
          match.lifecycle !== MatchLifecycle.IN_PROGRESS
        )
          throw new AppealStateError(
            'Match is not awaiting an overtime appeal',
          );
        const round = await tx.round.findFirst({
          where: {
            matchId: input.matchId,
            stage: RoundStage.OVERTIME,
            invalidatedAt: null,
            endedAt: { not: null },
          },
          orderBy: { attemptNumber: 'desc' },
          select: { id: true, attemptNumber: true },
        });
        if (!round)
          throw new AppealStateError('A completed overtime round is required');
        const unresolved = await tx.scoringWindow.findFirst({
          where: {
            matchId: input.matchId,
            roundId: round.id,
            invalidatedAt: null,
            resolvedAt: null,
          },
        });
        const prior = await tx.matchAppeal.findFirst({
          where: {
            matchId: input.matchId,
            scope: MatchAppealScope.OVERTIME,
            attemptNumber: round.attemptNumber,
            invalidatedAt: null,
          },
        });
        if (unresolved || prior)
          throw new AppealStateError(
            'Overtime appeal inputs are incomplete or already committed',
          );
        const [athletes, summaries] = await Promise.all([
          tx.matchAthlete.findMany({
            where: { matchId: input.matchId },
            select: { id: true, color: true },
          }),
          tx.roundAthleteResult.findMany({
            where: {
              matchId: input.matchId,
              roundId: round.id,
              invalidatedAt: null,
            },
            select: { athleteId: true, refereePoints: true },
          }),
        ]);
        if (athletes.length !== 2 || summaries.length !== 2)
          throw new AppealStateError('Overtime round summary is missing');
        const score = (color: AthleteColor) => {
          const athlete = athletes.find((x) => x.color === color)!;
          const base =
            summaries.find((x) => x.athleteId === athlete.id)?.refereePoints ??
            0;
          const adjustment = input.payload[color];
          return {
            athlete,
            base,
            ...adjustment,
            final: finalScore(base, adjustment),
          };
        };
        const red = score(AthleteColor.RED),
          blue = score(AthleteColor.BLUE),
          isTie = red.final === blue.final;
        const clock = (
          await tx.$queryRaw<
            Array<{ now: Date }>
          >`SELECT clock_timestamp() AS now`
        )[0]!.now;
        const appeal = await tx.matchAppeal.create({
          data: {
            matchId: input.matchId,
            scope: MatchAppealScope.OVERTIME,
            attemptNumber: round.attemptNumber,
            sourceRoundId: round.id,
            idempotencyKey: input.payload.idempotencyKey,
            completedAt: clock,
            ...(input.identity.kind === 'official'
              ? { completedInspectorAssignmentId: input.identity.assignmentId }
              : { completedInspectorSessionId: input.identity.sessionId }),
            sourceRounds: { create: { roundId: round.id } },
            adjustments: {
              create: [red, blue].map((x) => ({
                athleteId: x.athlete.id,
                baseRefereeScore: x.base,
                bonusPoints: x.bonusPoints,
                penaltyPoints: x.penaltyPoints,
                finalScore: x.final,
              })),
            },
          },
          select: { id: true },
        });
        const phase = isTie
          ? MatchStatus.OVERTIME_TIEBREAK_DECISION
          : MatchStatus.RESULT_PUBLICATION_READY;
        await tx.match.update({
          where: { id: input.matchId },
          data: { status: phase },
        });
        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.MATCH_ACTION,
            matchId: input.matchId,
            ...auditActor(input.identity),
            metadata: {
              action: 'OVERTIME_APPEAL_COMPLETED',
              appealId: appeal.id,
              attemptNumber: round.attemptNumber,
              isTie,
              phase,
            },
          },
        });
        return {
          appealId: appeal.id,
          matchId: input.matchId,
          matchPublicId: match.publicId,
          phase,
          attemptNumber: round.attemptNumber,
          isTie,
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }

  async restart(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockMatch(tx, input.matchId);
        await this.inspectorAuthorization.lockAndVerify(
          tx,
          input.matchId,
          input.identity,
          new AppealIdentityError('Inspector assignment or session is stale'),
        );
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: { publicId: true, status: true, rulesVersion: true },
        });
        if (match.rulesVersion !== MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2)
          throw new AppealStateError(
            'Overtime is unavailable for legacy matches',
          );
        if (match.status !== MatchStatus.OVERTIME_TIEBREAK_DECISION)
          throw new AppealStateError(
            'Only a tied committed overtime appeal may be restarted',
          );
        const appeal = await tx.matchAppeal.findFirstOrThrow({
          where: {
            matchId: input.matchId,
            scope: MatchAppealScope.OVERTIME,
            status: 'COMPLETED',
            invalidatedAt: null,
          },
          orderBy: { attemptNumber: 'desc' },
          select: { id: true, attemptNumber: true, sourceRoundId: true },
        });
        const audit = await tx.auditLog.create({
          data: {
            eventType: AuditEventType.MATCH_ACTION,
            matchId: input.matchId,
            ...auditActor(input.identity),
            metadata: {
              action: 'OVERTIME_RESTARTED',
              attemptNumber: appeal.attemptNumber,
            },
          },
          select: { id: true },
        });
        await Promise.all([
          tx.round.update({
            where: { id: appeal.sourceRoundId },
            data: { invalidatedAt: new Date(), invalidatedByAuditId: audit.id },
          }),
          tx.roundAthleteResult.updateMany({
            where: { roundId: appeal.sourceRoundId, invalidatedAt: null },
            data: { invalidatedAt: new Date(), invalidatedByAuditId: audit.id },
          }),
          tx.scoreEvent.updateMany({
            where: { roundId: appeal.sourceRoundId, revertedAt: null },
            data: { revertedAt: new Date(), revertedByAuditId: audit.id },
          }),
          tx.fault.updateMany({
            where: { roundId: appeal.sourceRoundId, invalidatedAt: null },
            data: { invalidatedAt: new Date(), invalidatedByAuditId: audit.id },
          }),
          tx.scoringWindow.updateMany({
            where: { roundId: appeal.sourceRoundId, invalidatedAt: null },
            data: { invalidatedAt: new Date(), invalidatedByAuditId: audit.id },
          }),
          tx.matchAppeal.update({
            where: { id: appeal.id },
            data: {
              status: 'INVALIDATED',
              invalidatedAt: new Date(),
              invalidatedByAuditId: audit.id,
            },
          }),
          tx.matchResultDecision.updateMany({
            where: { sourceAppealId: appeal.id, invalidatedAt: null },
            data: { invalidatedAt: new Date(), invalidatedByAuditId: audit.id },
          }),
          tx.match.update({
            where: { id: input.matchId },
            data: { status: MatchStatus.OVERTIME_READY },
          }),
        ]);
        return {
          matchId: input.matchId,
          matchPublicId: match.publicId,
          attemptNumber: appeal.attemptNumber + 1,
          phase: MatchStatus.OVERTIME_READY,
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }

  async manualWinner(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
    winner: AthleteColor;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockMatch(tx, input.matchId);
        await this.inspectorAuthorization.lockAndVerify(
          tx,
          input.matchId,
          input.identity,
          new AppealIdentityError('Inspector assignment or session is stale'),
        );
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: { publicId: true, status: true, rulesVersion: true },
        });
        if (match.rulesVersion !== MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2)
          throw new AppealStateError(
            'Overtime is unavailable for legacy matches',
          );
        if (match.status !== MatchStatus.OVERTIME_TIEBREAK_DECISION)
          throw new AppealStateError(
            'Manual winner requires a tied overtime appeal',
          );
        const appeal = await tx.matchAppeal.findFirstOrThrow({
          where: {
            matchId: input.matchId,
            scope: MatchAppealScope.OVERTIME,
            status: 'COMPLETED',
            invalidatedAt: null,
          },
          orderBy: { attemptNumber: 'desc' },
          select: { id: true, attemptNumber: true, sourceRoundId: true },
        });
        const athlete = await tx.matchAthlete.findUniqueOrThrow({
          where: {
            matchId_color: { matchId: input.matchId, color: input.winner },
          },
          select: { id: true },
        });
        // This is a private, durable selection.  MatchOutcome is reserved for
        // the subsequent explicit publication transaction.
        await tx.matchResultDecision.create({
          data: {
            matchId: input.matchId,
            winnerAthleteId: athlete.id,
            winnerColor: input.winner,
            sourceAppealId: appeal.id,
            sourceOvertimeRoundId: appeal.sourceRoundId,
            ...(input.identity.kind === 'official'
              ? { selectedInspectorAssignmentId: input.identity.assignmentId }
              : { selectedInspectorSessionId: input.identity.sessionId }),
          },
        });
        await tx.match.update({
          where: { id: input.matchId },
          data: { status: MatchStatus.RESULT_PUBLICATION_READY },
        });
        await tx.auditLog.create({
          data: {
            eventType: AuditEventType.MATCH_ACTION,
            matchId: input.matchId,
            ...auditActor(input.identity),
            metadata: {
              action: 'MANUAL_AFTER_OVERTIME_TIE_SELECTED',
              winner: input.winner,
              appealId: appeal.id,
              attemptNumber: appeal.attemptNumber,
              pendingPublication: true,
            },
          },
        });
        return {
          matchId: input.matchId,
          matchPublicId: match.publicId,
          attemptNumber: appeal.attemptNumber,
          phase: MatchStatus.RESULT_PUBLICATION_READY,
          winner: input.winner,
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
  private async lockMatch(tx: Prisma.TransactionClient, matchId: string) {
    await tx.$queryRaw`SELECT id FROM matches WHERE id=${matchId}::uuid FOR UPDATE`;
  }
}
