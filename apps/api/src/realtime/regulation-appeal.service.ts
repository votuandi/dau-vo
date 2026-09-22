import { Inject, Injectable } from '@nestjs/common';
import {
  AthleteColor,
  AuditEventType,
  MatchAppealScope,
  MatchLifecycle,
  MatchRulesVersion,
  MatchStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { InspectorCommandIdentity } from './command-identity';
import { auditActor } from './command-identity';
import { InspectorAuthorizationService } from './inspector-authorization.service';

export const MAX_REGULATION_APPEAL_POINTS = 100;
export class AppealStateError extends Error {}
export class AppealIdentityError extends Error {}
export class AppealIdempotencyError extends Error {}

export type RegulationAppealInput = {
  RED: { bonusPoints: number; penaltyPoints: number };
  BLUE: { bonusPoints: number; penaltyPoints: number };
  idempotencyKey: string;
  traceId?: string;
};
export type RegulationAppealTransition = {
  appealId: string;
  matchId: string;
  matchPublicId: string;
  phase: MatchStatus;
  regulation: {
    RED: {
      base: number;
      bonusPoints: number;
      penaltyPoints: number;
      final: number;
    };
    BLUE: {
      base: number;
      bonusPoints: number;
      penaltyPoints: number;
      final: number;
    };
  };
  isTie: boolean;
};

@Injectable()
export class RegulationAppealService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InspectorAuthorizationService)
    private readonly inspectorAuthorization: InspectorAuthorizationService,
  ) {}

  async complete(input: {
    matchId: string;
    identity: InspectorCommandIdentity;
    payload: RegulationAppealInput;
  }): Promise<RegulationAppealTransition> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "matches" WHERE "id"=${input.matchId}::uuid FOR UPDATE`;
        await this.inspectorAuthorization.lockAndVerify(
          tx,
          input.matchId,
          input.identity,
          new AppealIdentityError('Inspector assignment or session is stale'),
        );
        const match = await tx.match.findUniqueOrThrow({
          where: { id: input.matchId },
          select: {
            lifecycle: true,
            publicId: true,
            rulesVersion: true,
            status: true,
          },
        });
        const existing = await tx.matchAppeal.findFirst({
          where: { idempotencyKey: input.payload.idempotencyKey },
          include: {
            adjustments: { include: { athlete: { select: { color: true } } } },
          },
        });
        if (existing) {
          const replay = this.replay(
            existing,
            input.payload,
            match.publicId,
            match.status,
          );
          if (replay) return replay;
          throw new AppealIdempotencyError(
            'Idempotency key was previously used with a different appeal payload',
          );
        }
        if (
          match.rulesVersion !== MatchRulesVersion.FAULT_APPEAL_OVERTIME_V2 ||
          match.lifecycle !== MatchLifecycle.IN_PROGRESS ||
          match.status !== MatchStatus.REGULATION_APPEAL
        )
          throw new AppealStateError(
            'Match is not awaiting a regulation appeal',
          );
        const [rounds, unresolved, priorAppeal, athletes] = await Promise.all([
          tx.round.findMany({
            where: {
              matchId: input.matchId,
              stage: 'REGULATION',
              attemptNumber: 0,
              invalidatedAt: null,
              endedAt: { not: null },
            },
            orderBy: { roundNumber: 'asc' },
            select: { id: true, roundNumber: true },
          }),
          tx.scoringWindow.findFirst({
            where: {
              matchId: input.matchId,
              invalidatedAt: null,
              resolvedAt: null,
            },
            select: { id: true },
          }),
          tx.matchAppeal.findFirst({
            where: {
              matchId: input.matchId,
              scope: MatchAppealScope.REGULATION,
              attemptNumber: 0,
              status: 'COMPLETED',
              invalidatedAt: null,
            },
            select: { id: true },
          }),
          tx.matchAthlete.findMany({
            where: { matchId: input.matchId },
            orderBy: { color: 'asc' },
            select: { id: true, color: true },
          }),
        ]);
        if (
          unresolved ||
          rounds.length !== 2 ||
          rounds[0]?.roundNumber !== 1 ||
          rounds[1]?.roundNumber !== 2 ||
          athletes.length !== 2 ||
          priorAppeal
        )
          throw new AppealStateError(
            'Regulation appeal inputs are incomplete or no longer valid',
          );
        const summaries = await tx.roundAthleteResult.findMany({
          where: {
            matchId: input.matchId,
            roundId: { in: rounds.map((r) => r.id) },
            invalidatedAt: null,
          },
          select: { athleteId: true, refereePoints: true, roundId: true },
        });
        if (summaries.length !== 4)
          throw new AppealStateError(
            'Valid regulation round summaries are required',
          );
        const base = new Map<string, number>();
        for (const summary of summaries)
          base.set(
            summary.athleteId,
            (base.get(summary.athleteId) ?? 0) + summary.refereePoints,
          );
        const values = athletes.map((athlete) => {
          const supplied = input.payload[athlete.color];
          const score = { base: base.get(athlete.id) ?? 0, ...supplied };
          return {
            athlete,
            ...score,
            final: score.base + score.bonusPoints - score.penaltyPoints,
          };
        });
        const clock = await tx.$queryRaw<
          Array<{ now: Date }>
        >`SELECT clock_timestamp() AS now`;
        const appeal = await tx.matchAppeal.create({
          data: {
            matchId: input.matchId,
            scope: MatchAppealScope.REGULATION,
            attemptNumber: 0,
            sourceRoundId: rounds[1]!.id,
            idempotencyKey: input.payload.idempotencyKey,
            completedAt: clock[0]!.now,
            ...(input.identity.kind === 'official'
              ? { completedInspectorAssignmentId: input.identity.assignmentId }
              : { completedInspectorSessionId: input.identity.sessionId }),
          },
          select: { id: true },
        });
        await tx.matchAppealRound.createMany({
          data: rounds.map((round) => ({
            appealId: appeal.id,
            roundId: round.id,
          })),
        });
        await tx.matchAppealAdjustment.createMany({
          data: values.map((x) => ({
            appealId: appeal.id,
            athleteId: x.athlete.id,
            baseRefereeScore: x.base,
            bonusPoints: x.bonusPoints,
            penaltyPoints: x.penaltyPoints,
            finalScore: x.final,
          })),
        });
        const red = values.find((x) => x.athlete.color === AthleteColor.RED)!;
        const blue = values.find((x) => x.athlete.color === AthleteColor.BLUE)!;
        const isTie = red.final === blue.final;
        const phase = isTie
          ? MatchStatus.OVERTIME_READY
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
              action: 'REGULATION_APPEAL_COMPLETED',
              appealId: appeal.id,
              idempotencyKey: input.payload.idempotencyKey,
              traceId: input.payload.traceId ?? null,
              phase,
              isTie,
              regulation: { RED: this.score(red), BLUE: this.score(blue) },
            },
          },
        });
        return {
          appealId: appeal.id,
          matchId: input.matchId,
          matchPublicId: match.publicId,
          phase,
          isTie,
          regulation: { RED: this.score(red), BLUE: this.score(blue) },
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }

  private score(x: {
    base: number;
    bonusPoints: number;
    penaltyPoints: number;
    final: number;
  }) {
    return {
      base: x.base,
      bonusPoints: x.bonusPoints,
      penaltyPoints: x.penaltyPoints,
      final: x.final,
    };
  }
  private replay(
    existing: {
      id: string;
      matchId: string;
      scope: MatchAppealScope;
      adjustments: Array<{
        baseRefereeScore: number;
        bonusPoints: number;
        penaltyPoints: number;
        finalScore: number;
        athlete: { color: AthleteColor };
      }>;
    },
    payload: RegulationAppealInput,
    publicId: string,
    phase: MatchStatus,
  ): RegulationAppealTransition | null {
    if (
      existing.scope !== MatchAppealScope.REGULATION ||
      existing.adjustments.length !== 2
    )
      return null;
    const byColor = new Map(
      existing.adjustments.map((x) => [x.athlete.color, x]),
    );
    for (const color of [AthleteColor.RED, AthleteColor.BLUE]) {
      const adjustment = byColor.get(color);
      const sent = payload[color];
      if (
        !adjustment ||
        adjustment.bonusPoints !== sent.bonusPoints ||
        adjustment.penaltyPoints !== sent.penaltyPoints
      )
        return null;
    }
    const red = byColor.get(AthleteColor.RED);
    const blue = byColor.get(AthleteColor.BLUE);
    if (!red || !blue) return null;
    const isTie = red.finalScore === blue.finalScore;
    return {
      appealId: existing.id,
      matchId: existing.matchId,
      matchPublicId: publicId,
      phase,
      isTie,
      regulation: {
        RED: {
          base: red.baseRefereeScore,
          bonusPoints: red.bonusPoints,
          penaltyPoints: red.penaltyPoints,
          final: red.finalScore,
        },
        BLUE: {
          base: blue.baseRefereeScore,
          bonusPoints: blue.bonusPoints,
          penaltyPoints: blue.penaltyPoints,
          final: blue.finalScore,
        },
      },
    };
  }
}
